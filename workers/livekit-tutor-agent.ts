import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AutoSubscribe, cli, defineAgent, ServerOptions, voice, type JobContext } from '@livekit/agents'
import * as openai from '@livekit/agents-plugin-openai'
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
import { resolveOpenAIRealtimeModel } from '@/lib/tutor/realtime-model-policy'
import type { LiveKitTutorPayload } from '@/lib/livekit/messages'
import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'

const DEFAULT_AGENT_NAME = 'lemma-livekit-tutor'
const DEFAULT_VOICE = 'marin'
const CANVAS_RPC_METHOD = 'lemma_canvas_action'

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
  const metadata = parseJsonObject(ctx.info.acceptArguments.metadata)
  return {
    sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : '',
    gradeLevel: typeof metadata.gradeLevel === 'string' ? metadata.gradeLevel : '',
    language: typeof metadata.language === 'string' ? metadata.language : 'en',
    audioMode: metadata.audioMode === 'silent' ? 'silent' : 'microphone',
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
    const parsed = parseJsonObject(raw) as { type?: string; text?: string }
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : ''
    if (!text) return

    session.generateReply({
      userInput: text.slice(0, 4000),
      instructions:
        'Respond as Lemma. If the prompt needs arithmetic, graphing, geometry, fractions, ratios, percents, data, or probability support, use your deterministic tools and render on the board when helpful.',
    })
  })

  ctx.room.registerTextStreamHandler(LIVEKIT_TOPICS.canvasContext, async (reader) => {
    await reader.readAll()
    session.generateReply({
      userInput:
        'The student shared their current board. Acknowledge it briefly and ask what part they want help with unless their last message already made that clear.',
    })
  })
}

loadLocalEnv()

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const liveKitConfig = getLiveKitServerConfig()
    if (!liveKitConfig.configured) {
      throw new Error(`LiveKit worker is missing: ${liveKitConfig.missing.join(', ')}`)
    }

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY)
    const student = await ctx.waitForParticipant()

    const instructions = await buildWorkerInstructions(ctx)
    const metadata = parseMetadata(ctx)
    const tools = createLiveKitTutorToolContext({
      sessionId: metadata.sessionId,
      sendToolEvent: async (event) => {
        await sendTextToStudent(ctx, student, LIVEKIT_TOPICS.toolEvent, JSON.parse(serializeLiveKitWorkerToolEvent(event)))
      },
      dispatchCanvasActions: async (actions) => {
        await dispatchCanvasActions(ctx, student, actions)
      },
    })

    const realtimeModel = resolveOpenAIRealtimeModel(process.env.OPENAI_LIVEKIT_REALTIME_MODEL)

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        apiKey: process.env.OPENAI_API_KEY,
        model: realtimeModel.id,
        voice: process.env.OPENAI_LIVEKIT_VOICE || DEFAULT_VOICE,
      }),
      maxToolSteps: 6,
      userAwayTimeout: 45,
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
          toolName: 'livekit_agent',
          output: {
            error: event.error instanceof Error ? event.error.message : 'LiveKit agent error.',
          },
        },
      })
    })

    await session.start({
      agent: new voice.Agent({
        id: 'lemma-livekit-math-tutor',
        instructions,
        tools,
      }),
      room: ctx.room,
    })

    await session.generateReply({
      instructions:
        'Greet the student in one sentence as Lemma, then invite them to say or type the math problem they want to work on.',
    })
  },
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: process.env.LIVEKIT_AGENT_NAME || DEFAULT_AGENT_NAME,
    })
  )
}
