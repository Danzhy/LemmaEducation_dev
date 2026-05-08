import { createLiveKitTutorToolContext } from '@/lib/livekit/worker-tools'
import type { TutorCanvasAction, TutorToolEvent } from '@/lib/tutor/session-adapter'

type ToolEventDraft = Omit<TutorToolEvent, 'id' | 'createdAt'>

async function main() {
  const events: ToolEventDraft[] = []
  const canvasActions: TutorCanvasAction[] = []
  const tools = createLiveKitTutorToolContext({
    sendToolEvent: async (event) => {
      events.push(event)
    },
    dispatchCanvasActions: async (actions) => {
      canvasActions.push(...actions)
    },
  })

  const requiredTools = [
    'math_calculate',
    'math_check_step',
    'math_solve_linear',
    'graph_function',
    'fraction_strip',
    'percent_bar',
    'ratio_table',
    'geometry_figure',
  ]

  for (const toolName of requiredTools) {
    if (!tools[toolName]) {
      throw new Error(`Missing LiveKit worker tool: ${toolName}`)
    }
  }

  const mathResult = await tools.math_calculate.execute(
    { expression: '(3/4) + 0.5' },
    { ctx: {} as never, toolCallId: 'smoke-calc' }
  )
  const graphResult = await tools.graph_function.execute(
    { expression: '2*x + 1' },
    { ctx: {} as never, toolCallId: 'smoke-graph' }
  )

  if (!JSON.stringify(mathResult).includes('1.25')) {
    throw new Error(`Unexpected math_calculate result: ${JSON.stringify(mathResult)}`)
  }

  if (canvasActions.length === 0 || !JSON.stringify(graphResult).includes('canvas')) {
    throw new Error('graph_function did not produce board-renderable actions.')
  }

  const started = events.filter((event) => event.type === 'tool_started').length
  const completed = events.filter((event) => event.type === 'tool_completed').length

  if (started < 2 || completed < 2) {
    throw new Error('LiveKit worker tool events were not emitted correctly.')
  }

  const telemetryFailureTools = createLiveKitTutorToolContext({
    sendToolEvent: async () => {
      throw new Error('simulated telemetry outage')
    },
  })
  const resilientResult = await telemetryFailureTools.math_calculate.execute(
    { expression: '8 * 7' },
    { ctx: {} as never, toolCallId: 'smoke-telemetry-outage' }
  )

  if (!JSON.stringify(resilientResult).includes('56')) {
    throw new Error('Tool failed when optional telemetry failed.')
  }

  const budgetedTools = createLiveKitTutorToolContext({ maxToolCallsPerSession: 1 })
  await budgetedTools.math_calculate.execute(
    { expression: '1 + 1' },
    { ctx: {} as never, toolCallId: 'smoke-budget-1' }
  )

  let budgetRejected = false
  try {
    await budgetedTools.math_calculate.execute(
      { expression: '2 + 2' },
      { ctx: {} as never, toolCallId: 'smoke-budget-2' }
    )
  } catch {
    budgetRejected = true
  }

  if (!budgetRejected) {
    throw new Error('Tool-call safety budget did not reject an extra call.')
  }

  const canvasBudget: TutorCanvasAction[] = []
  const canvasBudgetTools = createLiveKitTutorToolContext({
    maxCanvasActionsPerSession: 1,
    dispatchCanvasActions: async (actions) => {
      canvasBudget.push(...actions)
    },
  })
  await canvasBudgetTools.graph_function.execute(
    { expression: 'x' },
    { ctx: {} as never, toolCallId: 'smoke-canvas-budget' }
  )

  if (canvasBudget.length > 1) {
    throw new Error('Canvas-action budget allowed too many actions.')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        toolCount: Object.keys(tools).length,
        events: events.length,
        canvasActions: canvasActions.length,
        budgetRejected,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
