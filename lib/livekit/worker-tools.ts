import { llm } from '@livekit/agents'
import type { JSONSchema7 } from 'json-schema'
import { LIVEKIT_TOPICS, type LiveKitTutorPayload } from '@/lib/livekit/messages'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import type { TutorCanvasAction, TutorToolEvent } from '@/lib/tutor/session-adapter'
import {
  getLiveKitToolDefinitions,
  runLiveKitTutorToolWithMetrics,
  type LiveKitToolRunContext,
} from '@/lib/livekit/tool-runner'

const MAX_TOOL_RESULT_BYTES = 24_000
const DEFAULT_MAX_TOOL_CALLS_PER_SESSION = 96
const DEFAULT_MAX_CANVAS_ACTIONS_PER_SESSION = 700

type LiveKitWorkerToolDefinition = {
  name: string
  description?: string
  parameters?: JSONSchema7
}

type WorkerToolEvent = Omit<TutorToolEvent, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: number
}

export type LiveKitWorkerToolEnvironment = {
  sendToolEvent?: (event: WorkerToolEvent) => Promise<void>
  dispatchCanvasActions?: (actions: TutorCanvasAction[], toolName: string) => Promise<void>
  maxToolCallsPerSession?: number
  maxCanvasActionsPerSession?: number
  userId?: string | null
  sessionId?: string | null
}

function jsonByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length
}

function compactToolResultForModel(output: unknown) {
  if (jsonByteLength(output) <= MAX_TOOL_RESULT_BYTES) return output

  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>
    const compacted = {
      ...record,
      canvasActions: undefined,
      actionPlan: undefined,
      note:
        'The full tool output was rendered to the board, but large drawing payloads were omitted from the model-visible result.',
    }
    if (jsonByteLength(compacted) <= MAX_TOOL_RESULT_BYTES) return compacted
    return {
      truncated: true,
      note: 'Tool output exceeded the model-visible size limit.',
    }
  }

  return {
    value: String(output).slice(0, 4000),
    truncated: true,
  }
}

function createToolEventPayload(event: WorkerToolEvent): LiveKitTutorPayload {
  return {
    type: 'tool_event',
    event: {
      ...event,
      metadata: {
        ...(event.metadata ?? {}),
        transport: 'livekit-worker',
      },
    },
  }
}

export function serializeLiveKitWorkerToolEvent(event: WorkerToolEvent) {
  return JSON.stringify(createToolEventPayload(event))
}

async function safeSendToolEvent(env: LiveKitWorkerToolEnvironment, event: WorkerToolEvent) {
  try {
    await env.sendToolEvent?.(event)
  } catch {
    // Tool correctness should not depend on the optional UI telemetry stream.
  }
}

async function safeDispatchCanvasActions(
  env: LiveKitWorkerToolEnvironment,
  actions: TutorCanvasAction[],
  toolName: string
) {
  try {
    await env.dispatchCanvasActions?.(actions, toolName)
  } catch {
    // The voice tutor can still explain if the board action transport is unavailable.
  }
}

export function createLiveKitTutorToolContext(env: LiveKitWorkerToolEnvironment = {}): llm.ToolContext {
  const tools: llm.ToolContext = {}
  const maxToolCalls = env.maxToolCallsPerSession ?? DEFAULT_MAX_TOOL_CALLS_PER_SESSION
  const maxCanvasActions = env.maxCanvasActionsPerSession ?? DEFAULT_MAX_CANVAS_ACTIONS_PER_SESSION
  let toolCalls = 0
  let canvasActionsDispatched = 0

  for (const toolDef of getLiveKitToolDefinitions() as LiveKitWorkerToolDefinition[]) {
    const toolName = toolDef.name
    tools[toolName] = llm.tool({
      description: toolDef.description ?? `Run the ${toolName} math tutoring tool.`,
      parameters: toolDef.parameters ?? {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async (input, options) => {
        const callId = options.toolCallId
        toolCalls += 1

        if (toolCalls > maxToolCalls) {
          throw new Error('This LiveKit tutor session has reached its tool-call safety budget.')
        }

        await safeSendToolEvent(env, {
          type: 'tool_started',
          toolName,
          input,
          metadata: { callId, toolCalls, maxToolCalls },
        })

        try {
          const runContext: LiveKitToolRunContext = {
            userId: env.userId,
            sessionId: env.sessionId,
          }
          const { output, metrics } = await runLiveKitTutorToolWithMetrics(toolName, input, runContext)
          const modelOutput = compactToolResultForModel(output)
          const remainingCanvasActions = Math.max(0, maxCanvasActions - canvasActionsDispatched)
          const actions = extractCanvasActionsFromToolResult(toolName, output).slice(0, Math.min(40, remainingCanvasActions))
          const modelOutputWasCompacted = modelOutput !== output
          canvasActionsDispatched += actions.length

          await safeSendToolEvent(env, {
            type: 'tool_completed',
            toolName,
            input,
            output: modelOutput,
            metadata: {
              callId,
              ...metrics,
              modelOutputWasCompacted,
              renderedActions: actions.length,
              canvasActionsDispatched,
              maxCanvasActions,
            },
          })

          if (actions.length > 0) {
            await safeDispatchCanvasActions(env, actions, toolName)
          }

          return modelOutput
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool failed.'
          await safeSendToolEvent(env, {
            type: 'tool_failed',
            toolName,
            input,
            output: { error: message },
            metadata: { callId },
          })
          throw error
        }
      },
    })
  }

  return tools
}

export { LIVEKIT_TOPICS }
