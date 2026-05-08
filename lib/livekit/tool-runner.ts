import type { Tool } from '@openai/agents'
import { createVoiceAgentTools } from '@/lib/voice-agent/tools'

const MAX_TOOL_INPUT_BYTES = 12_000

type ToolWithInvoke = Tool & {
  invoke?: (context: unknown, input: string) => Promise<string>
}

let toolRegistry: Map<string, ToolWithInvoke> | null = null

function getToolRegistry() {
  if (!toolRegistry) {
    toolRegistry = new Map(
      (createVoiceAgentTools() as ToolWithInvoke[]).map((toolDef) => [toolDef.name, toolDef])
    )
  }
  return toolRegistry
}

export function getLiveKitToolNames() {
  return [...getToolRegistry().keys()].sort()
}

export async function runLiveKitTutorTool(toolName: string, input: unknown) {
  const toolDef = getToolRegistry().get(toolName)
  if (!toolDef?.invoke) {
    throw new Error(`Unsupported LiveKit tutor tool: ${toolName}`)
  }

  const payload = JSON.stringify(input ?? {})
  if (new TextEncoder().encode(payload).length > MAX_TOOL_INPUT_BYTES) {
    throw new Error('Tool input is too large for the LiveKit lab.')
  }

  const rawResult = await toolDef.invoke(null, payload)
  try {
    return JSON.parse(rawResult)
  } catch {
    return rawResult
  }
}
