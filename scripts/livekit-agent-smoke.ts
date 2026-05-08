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
    'tutor_teaching_sequence',
    'board_animation_plan',
    'hint_ladder',
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
  const teachingResult = await tools.tutor_teaching_sequence.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      studentGoal: 'I need help adding unlike denominators.',
      studentWork: '1/2 + 1/3 = 2/5',
    },
    { ctx: {} as never, toolCallId: 'smoke-teaching-sequence' }
  )
  const animationResult = await tools.board_animation_plan.execute(
    {
      concept: 'Explain equivalent fractions with a staged reveal',
      visualType: 'part-whole visual reveal',
      gradeLevel: 'Grade 4',
      wantsOfflineVideo: false,
    },
    { ctx: {} as never, toolCallId: 'smoke-animation-plan' }
  )
  const ladderResult = await tools.hint_ladder.execute(
    {
      topic: 'fractions',
      misconception: '',
      studentWork: '1/2 + 1/3 = 2/5',
      correctIdea: '',
    },
    { ctx: {} as never, toolCallId: 'smoke-hint-ladder' }
  )

  if (!JSON.stringify(mathResult).includes('1.25')) {
    throw new Error(`Unexpected math_calculate result: ${JSON.stringify(mathResult)}`)
  }

  if (canvasActions.length === 0 || !JSON.stringify(graphResult).includes('canvas')) {
    throw new Error('graph_function did not produce board-renderable actions.')
  }

  if (!JSON.stringify(teachingResult).includes('boardPlan')) {
    throw new Error('tutor_teaching_sequence did not return a board plan.')
  }

  if (!JSON.stringify(animationResult).includes('tldraw_step_reveal')) {
    throw new Error('board_animation_plan did not default to the live board renderer.')
  }

  if (!JSON.stringify(ladderResult).includes('gentle')) {
    throw new Error('hint_ladder did not return scaffolded hint levels.')
  }

  const started = events.filter((event) => event.type === 'tool_started').length
  const completed = events.filter((event) => event.type === 'tool_completed').length
  const completedWithTiming = events.filter(
    (event) => event.type === 'tool_completed' && typeof event.metadata?.durationMs === 'number'
  ).length

  if (started < 5 || completed < 5) {
    throw new Error('LiveKit worker tool events were not emitted correctly.')
  }

  if (completedWithTiming < 5) {
    throw new Error('LiveKit worker tool events did not include execution timing metadata.')
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
