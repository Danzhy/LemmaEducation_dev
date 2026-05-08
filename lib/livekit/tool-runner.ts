import type { Tool } from '@openai/agents'
import { createVoiceAgentTools } from '@/lib/voice-agent/tools'
import {
  getCurriculumSearchUserId,
  searchCurriculumForUser,
} from '@/lib/curriculum/search'

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
    registry.set('curriculum_search', createCurriculumSearchTool())
    toolRegistry = registry
  }
  return toolRegistry
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
