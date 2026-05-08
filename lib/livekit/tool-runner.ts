import type { Tool } from '@openai/agents'
import { createVoiceAgentTools } from '@/lib/voice-agent/tools'

const MAX_TOOL_INPUT_BYTES = 12_000

type ToolWithInvoke = Tool & {
  invoke?: (context: unknown, input: string) => Promise<string>
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
    toolRegistry = new Map(
      (createVoiceAgentTools() as ToolWithInvoke[]).map((toolDef) => [toolDef.name, toolDef])
    )
  }
  return toolRegistry
}

export function getLiveKitToolDefinitions() {
  return [...getToolRegistry().values()]
}

export function getLiveKitToolNames() {
  return [...getToolRegistry().keys()].sort()
}

export async function runLiveKitTutorToolWithMetrics(toolName: string, input: unknown) {
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
  const rawResult = await toolDef.invoke(null, payload)
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

export async function runLiveKitTutorTool(toolName: string, input: unknown) {
  const { output } = await runLiveKitTutorToolWithMetrics(toolName, input)
  return output
}
