import type { Tool } from '@openai/agents'
import { createVoiceAgentTools } from '@/lib/voice-agent/tools'
import {
  getCurriculumSearchUserId,
  searchCurriculumForUser,
} from '@/lib/curriculum/search'
import {
  buildCurriculumContextToolResult,
  getLabTutorCurriculumContextPackForUser,
} from '@/lib/curriculum/context'
import {
  getLearnerContextForUser,
  getLearnerContextUserId,
} from '@/lib/tutor/learner-context'

const MAX_TOOL_INPUT_BYTES = 12_000

type ToolWithInvoke = Tool & {
  invoke?: (context: unknown, input: string) => Promise<string>
}

export type LiveKitToolRunContext = {
  userId?: string | null
  sessionId?: string | null
}

let toolRegistry: Map<string, ToolWithInvoke> | null = null

function jsonByteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function getToolRegistry() {
  if (!toolRegistry) {
    const registry = new Map(
      (createVoiceAgentTools() as ToolWithInvoke[]).map((toolDef) => [toolDef.name, toolDef])
    )
    registry.set('curriculum_context', createCurriculumContextTool())
    registry.set('curriculum_search', createCurriculumSearchTool())
    registry.set('learner_context', createLearnerContextTool())
    toolRegistry = registry
  }
  return toolRegistry
}

function createCurriculumContextTool(): ToolWithInvoke {
  return {
    name: 'curriculum_context',
    description:
      'Load the active teacher-created tutor profile and available curriculum document titles for this signed-in student or teacher. Use this before curriculum-specific tutoring, local typed lab planning, or when deciding how a custom class tutor should adapt vocabulary, pacing, and examples.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          description: 'Why the tutor needs curriculum context for this turn.',
        },
      },
      required: ['reason'],
    },
    async invoke(context: unknown) {
      const runContext = (context ?? {}) as LiveKitToolRunContext
      const userId = await getCurriculumSearchUserId(runContext)
      if (!userId) {
        throw new Error('Curriculum context needs a signed-in user or tutor session context.')
      }

      const pack = await getLabTutorCurriculumContextPackForUser(userId)
      return JSON.stringify(buildCurriculumContextToolResult(pack))
    },
  } as unknown as ToolWithInvoke
}

function createLearnerContextTool(): ToolWithInvoke {
  return {
    name: 'learner_context',
    description:
      'Load concise recent tutoring history for this signed-in learner: recent topics, struggle signals, useful tools, and suggested tutor adjustments. Use this when the student says "last time", asks to continue, asks what they struggle with, or when adapting a review session without exposing old private history verbatim.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional active tutor session id so the server can exclude the current session from history.',
        },
        reason: {
          type: 'string',
          description: 'Why learner history is relevant for this tutoring turn.',
        },
      },
      required: ['sessionId', 'reason'],
    },
    async invoke(context: unknown, input: string) {
      const parsed = JSON.parse(input || '{}') as {
        sessionId?: unknown
        reason?: unknown
      }
      const runContext = (context ?? {}) as LiveKitToolRunContext
      const sessionId = typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : runContext.sessionId
      const userId = await getLearnerContextUserId({
        userId: runContext.userId,
        sessionId,
      })
      if (!userId) {
        throw new Error('Learner context needs a signed-in user or tutor session context.')
      }

      const result = await getLearnerContextForUser({
        userId,
        sessionId,
      })
      return JSON.stringify({
        ...result,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : '',
      })
    },
  } as unknown as ToolWithInvoke
}

function createCurriculumSearchTool(): ToolWithInvoke {
  return {
    name: 'curriculum_search',
    description:
      'Search teacher-uploaded curriculum notes, lesson text, or classroom instructions before answering a curriculum-specific math question. Use this when the student asks about uploaded material, class vocabulary, homework directions, or the teacher custom agent profile.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'A concise math topic, lesson phrase, homework question, or curriculum lookup query.',
        },
        classroomId: {
          type: 'string',
          description: 'Optional classroom id when the lab session is scoped to one class.',
        },
        limit: {
          type: 'number',
          description: 'Optional result count. Keep this small.',
        },
      },
      required: ['query', 'classroomId', 'limit'],
    },
    async invoke(context: unknown, input: string) {
      const parsed = JSON.parse(input || '{}') as {
        query?: unknown
        classroomId?: unknown
        limit?: unknown
      }
      const runContext = (context ?? {}) as LiveKitToolRunContext
      const userId = await getCurriculumSearchUserId(runContext)
      if (!userId) {
        throw new Error('Curriculum search needs a signed-in user or tutor session context.')
      }

      const result = await searchCurriculumForUser({
        userId,
        query: typeof parsed.query === 'string' ? parsed.query : '',
        classroomId: typeof parsed.classroomId === 'string' ? parsed.classroomId : null,
        limit: typeof parsed.limit === 'number' ? parsed.limit : undefined,
      })
      return JSON.stringify(result)
    },
  } as ToolWithInvoke
}

export function getLiveKitToolDefinitions() {
  return [...getToolRegistry().values()]
}

export function getLiveKitToolNames() {
  return [...getToolRegistry().keys()].sort()
}

export async function runLiveKitTutorToolWithMetrics(
  toolName: string,
  input: unknown,
  context: LiveKitToolRunContext = {}
) {
  const toolDef = getToolRegistry().get(toolName)
  if (!toolDef?.invoke) {
    throw new Error(`Unsupported LiveKit tutor tool: ${toolName}`)
  }

  const payload = JSON.stringify(input ?? {})
  const inputBytes = new TextEncoder().encode(payload).length
  if (inputBytes > MAX_TOOL_INPUT_BYTES) {
    throw new Error('Tool input is too large for the LiveKit lab.')
  }

  const startedAt = Date.now()
  const rawResult = await toolDef.invoke(context, payload)
  const durationMs = Date.now() - startedAt
  let output: unknown
  try {
    output = JSON.parse(rawResult)
  } catch {
    output = rawResult
  }

  return {
    output,
    metrics: {
      durationMs,
      inputBytes,
      outputBytes: jsonByteLength(output),
    },
  }
}

export async function runLiveKitTutorTool(
  toolName: string,
  input: unknown,
  context: LiveKitToolRunContext = {}
) {
  const { output } = await runLiveKitTutorToolWithMetrics(toolName, input, context)
  return output
}
