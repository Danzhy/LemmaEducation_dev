import type { TutorCanvasAction } from '@/lib/tutor/session-adapter'

const STAGED_REVEAL_TOOL_NAMES = new Set([
  'board_animation_plan',
  'graph_function',
  'solve_linear_on_canvas',
  'write_on_canvas',
  'livekit_canvas_stream',
])

export type CanvasActionRevealBatch = {
  actions: TutorCanvasAction[]
  delayMs: number
}

export type CanvasActionRevealOptions = {
  sourceToolName?: string
  chunkSize?: number
  intervalMs?: number
  maxDelayMs?: number
}

export function shouldStageCanvasActions(actions: TutorCanvasAction[], sourceToolName = 'livekit_canvas') {
  if (actions.length <= 1) return false
  if (STAGED_REVEAL_TOOL_NAMES.has(sourceToolName)) return true
  return actions.length > 12
}

export function planCanvasActionReveal(
  actions: TutorCanvasAction[],
  {
    sourceToolName = 'livekit_canvas',
    chunkSize = 4,
    intervalMs = 180,
    maxDelayMs = 1800,
  }: CanvasActionRevealOptions = {}
): CanvasActionRevealBatch[] {
  if (actions.length === 0) return []
  if (!shouldStageCanvasActions(actions, sourceToolName)) return [{ actions, delayMs: 0 }]

  const normalizedChunkSize = Math.max(1, Math.floor(chunkSize))
  const batches: CanvasActionRevealBatch[] = []
  let remaining = actions
  let delayMs = 0

  if (remaining[0]?.type === 'clear_tool_layer') {
    batches.push({ actions: [remaining[0]], delayMs: 0 })
    remaining = remaining.slice(1)
    delayMs = Math.min(intervalMs, maxDelayMs)
  }

  while (remaining.length > 0) {
    const nextChunk = remaining.slice(0, normalizedChunkSize)
    remaining = remaining.slice(normalizedChunkSize)

    if (delayMs > maxDelayMs && batches.length > 0) {
      batches[batches.length - 1] = {
        ...batches[batches.length - 1],
        actions: [...batches[batches.length - 1].actions, ...nextChunk],
      }
    } else {
      batches.push({ actions: nextChunk, delayMs })
    }

    delayMs += intervalMs
  }

  return batches
}
