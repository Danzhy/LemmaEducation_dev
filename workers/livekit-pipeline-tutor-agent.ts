import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AutoSubscribe, cli, defineAgent, ServerOptions, voice, type JobContext } from '@livekit/agents'
import type { RemoteParticipant } from '@livekit/rtc-node'
import { getRequiredInstructionEnv } from '@/lib/tutor/tutor-env'
import { buildLiveKitTutorInstructions } from '@/lib/livekit/agent-instructions'
import { getLiveKitServerConfig } from '@/lib/livekit/config'
import { getLabTutorCurriculumContextForUser } from '@/lib/curriculum/context'
import { getCurriculumSearchUserId } from '@/lib/curriculum/search'
import {
  createLiveKitTutorToolContext,
  LIVEKIT_TOPICS,
  serializeLiveKitWorkerToolEvent,
} from '@/lib/livekit/worker-tools'
import {
  createLiveKitPipelineLLM,
  createLiveKitPipelineSTT,
  createLiveKitPipelineTTS,
} from '@/lib/livekit/pipeline-server'
import { resolveLiveKitPipelineSelection } from '@/lib/livekit/pipeline-config'
import {
  getLiveKitPipelineAgentName,
  resolveLiveKitPipelineModel,
} from '@/lib/livekit/pipeline-models'
import type { LiveKitTutorPayload } from '@/lib/livekit/messages'
import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'

const DEFAULT_AGENT_NAME = 'lemma-livekit-pipeline-tutor'
const CANVAS_RPC_METHOD = 'lemma_canvas_action'
type LiveKitAudioMode = 'microphone' | 'silent'

function loadLocalEnv(path = '.env.local') {
  if (!existsSync(path)) return

  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key && !process.env[key]) {
      process.env[key] = value
    }
  }
}

function parseJsonObject(value: string | undefined) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseMetadata(ctx: JobContext) {
  const metadata = {
    ...parseJsonObject(ctx.job.metadata),
    ...parseJsonObject(ctx.info.acceptArguments.metadata),
  }
  const audioMode: LiveKitAudioMode = metadata.audioMode === 'silent' ? 'silent' : 'microphone'
  return {
    sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : '',
    gradeLevel: typeof metadata.gradeLevel === 'string' ? metadata.gradeLevel : '',
    language: typeof metadata.language === 'string' ? metadata.language : 'en',
    audioMode,
    pipelineModelId:
      typeof metadata.pipelineModelId === 'string'
        ? metadata.pipelineModelId
        : resolveLiveKitPipelineModel(null).id,
  }
}

async function buildWorkerInstructions(ctx: JobContext) {
  const metadata = parseMetadata(ctx)
  const baseInstructions =
    getRequiredInstructionEnv(process.env.OPENAI_SOCRATIC_TUTOR_INSTRUCTIONS) ??
    'You are Lemma, a careful Socratic math tutor for students in grades 3 to 7. Help students reason step by step.'
  const userId = await getCurriculumSearchUserId({ sessionId: metadata.sessionId }).catch(() => null)
  const curriculumContext = userId
    ? await getLabTutorCurriculumContextForUser(userId).catch(() => '')
    : ''

  return buildLiveKitTutorInstructions({
    baseInstructions: [baseInstructions, curriculumContext].filter(Boolean).join('\n\n'),
    gradeLevel: metadata.gradeLevel,
    language: metadata.language,
  })
}

function stringifyPayload(payload: LiveKitTutorPayload | { actions: TutorCanvasAction[] }) {
  return JSON.stringify(payload)
}

async function sendTextToStudent(
  ctx: JobContext,
  student: RemoteParticipant,
  topic: string,
  payload: LiveKitTutorPayload | { actions: TutorCanvasAction[] }
) {
  const localParticipant = ctx.agent
  if (!localParticipant) return

  await localParticipant.sendText(stringifyPayload(payload), {
    topic,
    destinationIdentities: [student.identity],
  })
}

function getMessageText(item: unknown) {
  if (!item || typeof item !== 'object') return ''
  const maybeMessage = item as { textContent?: string; role?: string }
  return typeof maybeMessage.textContent === 'string' ? maybeMessage.textContent.trim() : ''
}

function buildStudentTurnFromText(raw: string) {
  const parsed = parseJsonObject(raw) as { text?: string; boardDescription?: string }
  const text = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : raw.trim()
  if (!text) return ''

  const boardDescription =
    typeof parsed.boardDescription === 'string' ? parsed.boardDescription.trim().slice(0, 1800) : ''

  return boardDescription
    ? `${text}\n\nVisible board summary from the student's current canvas:\n${boardDescription}`
    : text
}

function generateTutorReply(session: voice.AgentSession, userInput: string) {
  session.generateReply({
    userInput: userInput.slice(0, 4000),
    instructions:
      'Respond as Lemma. Keep the first spoken response short. Use one deterministic math or board tool when it clearly helps. Ask one question, then pause. If visible board context is included and the student references it, use board_state_summarizer before solving.',
  })
}

function handleLiveKitChatText(session: voice.AgentSession, rawText: string) {
  const userInput = buildStudentTurnFromText(rawText)
  if (!userInput) return

  session.interrupt()
  generateTutorReply(session, userInput)
}

async function dispatchCanvasActions(ctx: JobContext, student: RemoteParticipant, actions: TutorCanvasAction[]) {
  const localParticipant = ctx.agent
  if (!localParticipant || actions.length === 0) return

  const payload = JSON.stringify({ actions })
  try {
    await localParticipant.performRpc({
      destinationIdentity: student.identity,
      method: CANVAS_RPC_METHOD,
      payload,
      responseTimeout: 10_000,
    })
  } catch {
    await sendTextToStudent(ctx, student, LIVEKIT_TOPICS.canvasAction, { actions })
  }
}

function registerIncomingTextHandlers(ctx: JobContext, session: voice.AgentSession) {
  ctx.room.registerTextStreamHandler(LIVEKIT_TOPICS.userText, async (reader) => {
    const raw = await reader.readAll()
    handleLiveKitChatText(session, raw)
  })

  ctx.room.registerTextStreamHandler(LIVEKIT_TOPICS.canvasContext, async (reader) => {
    await reader.readAll()
    // Passive board snapshots should enrich later turns, not interrupt the student with a new reply.
  })
}

loadLocalEnv()

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const liveKitConfig = getLiveKitServerConfig()
    if (!liveKitConfig.configured) {
      throw new Error(`LiveKit pipeline worker is missing: ${liveKitConfig.missing.join(', ')}`)
    }

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY)
    const student = await ctx.waitForParticipant()

    const instructions = await buildWorkerInstructions(ctx)
    const metadata = parseMetadata(ctx)
    const pipeline = resolveLiveKitPipelineSelection(metadata.pipelineModelId)
    if (!pipeline.configured) {
      throw new Error(`LiveKit pipeline model is missing: ${pipeline.missing.join(', ')}`)
    }

    const tools = createLiveKitTutorToolContext({
      sessionId: metadata.sessionId,
      sendToolEvent: async (event) => {
        await sendTextToStudent(ctx, student, LIVEKIT_TOPICS.toolEvent, JSON.parse(serializeLiveKitWorkerToolEvent(event)))
      },
      dispatchCanvasActions: async (actions) => {
        await dispatchCanvasActions(ctx, student, actions)
      },
    })

    const session = new voice.AgentSession({
      stt: createLiveKitPipelineSTT(metadata.language),
      llm: createLiveKitPipelineLLM(pipeline.model),
      tts: createLiveKitPipelineTTS(),
      maxToolSteps: 4,
      userAwayTimeout: metadata.audioMode === 'silent' ? null : 45,
      aecWarmupDuration: 800,
      turnHandling: {
        turnDetection: metadata.audioMode === 'silent' ? 'manual' : 'stt',
        endpointing: {
          minDelay: 650,
          maxDelay: 3000,
        },
        interruption: {
          enabled: false,
        },
        preemptiveGeneration: {
          enabled: false,
        },
      },
    })

    registerIncomingTextHandlers(ctx, session)

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (!event.isFinal || !event.transcript.trim()) return
      void sendTextToStudent(ctx, student, LIVEKIT_TOPICS.assistantText, {
        type: 'chat_message',
        message: {
          role: 'user',
          content: event.transcript.trim(),
          source: 'speech',
        },
        createdAt: Date.now(),
      })
    })

    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      const item = event.item as { role?: string }
      if (item.role !== 'assistant') return
      const text = getMessageText(item)
      if (!text) return
      void sendTextToStudent(ctx, student, LIVEKIT_TOPICS.assistantText, {
        type: 'assistant_text',
        text,
        final: true,
        createdAt: Date.now(),
      })
    })

    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      void sendTextToStudent(ctx, student, LIVEKIT_TOPICS.toolEvent, {
        type: 'tool_event',
        event: {
          type: 'tool_failed',
          toolName: 'livekit_pipeline_agent',
          output: {
            error: event.error instanceof Error ? event.error.message : 'LiveKit pipeline agent error.',
          },
        },
      })
    })

    await session.start({
      agent: new voice.Agent({
        id: 'lemma-livekit-pipeline-math-tutor',
        instructions: `${instructions}\n\nYou are running in the STT to LLM to TTS LiveKit pipeline lab. The selected LLM is ${pipeline.model.label}. Keep responses short enough for TTS, use deterministic tools for math, and avoid answer dumping.`,
        tools,
      }),
      room: ctx.room,
      inputOptions: {
        audioEnabled: metadata.audioMode !== 'silent',
        textInputCallback: (_session, event) => {
          handleLiveKitChatText(_session, event.text)
        },
      },
      outputOptions: {
        transcriptionEnabled: true,
        audioEnabled: metadata.audioMode !== 'silent',
        syncTranscription: false,
        jsonFormat: false,
        queueSizeMs: 120,
      },
    })

    await sendTextToStudent(ctx, student, LIVEKIT_TOPICS.control, {
      type: 'session_ready',
      audioMode: metadata.audioMode,
      createdAt: Date.now(),
    })

    if (metadata.audioMode !== 'silent') {
      await session.generateReply({
        instructions:
          `Greet the student in one short sentence as Lemma. Mention that this pipeline is using ${pipeline.model.shortLabel} as the reasoning brain, then ask for the math problem.`,
      })
    }
  },
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: getLiveKitPipelineAgentName() || DEFAULT_AGENT_NAME,
    })
  )
}
