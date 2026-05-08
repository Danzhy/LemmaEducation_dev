import { llm } from '@livekit/agents'
import type { JSONSchema7 } from 'json-schema'
import { LIVEKIT_TOPICS, type LiveKitTutorPayload } from '@/lib/livekit/messages'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import type { TutorCanvasAction, TutorToolEvent } from '@/lib/tutor/session-adapter'
import { getLiveKitToolDefinitions, runLiveKitTutorTool } from '@/lib/livekit/tool-runner'

const MAX_TOOL_RESULT_BYTES = 24_000

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
}

function jsonByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length
}

function compactToolResultForModel(output: unknown) {
  if (jsonByteLength(output) <= MAX_TOOL_RESULT_BYTES) return output

  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>
    return {
      ...record,
      canvasActions: undefined,
      actionPlan: undefined,
      note:
        'The full tool output was rendered to the board, but large drawing payloads were omitted from the model-visible result.',
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

export function createLiveKitTutorToolContext(env: LiveKitWorkerToolEnvironment = {}): llm.ToolContext {
  const tools: llm.ToolContext = {}

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
        await env.sendToolEvent?.({
          type: 'tool_started',
          toolName,
          input,
          metadata: { callId },
        })

        try {
          const output = await runLiveKitTutorTool(toolName, input)
          const modelOutput = compactToolResultForModel(output)
          const actions = extractCanvasActionsFromToolResult(toolName, output).slice(0, 40)

          await env.sendToolEvent?.({
            type: 'tool_completed',
            toolName,
            input,
            output: modelOutput,
            metadata: {
              callId,
              renderedActions: actions.length,
            },
          })

          if (actions.length > 0) {
            await env.dispatchCanvasActions?.(actions, toolName)
          }

          return modelOutput
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool failed.'
          await env.sendToolEvent?.({
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
