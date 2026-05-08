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
    'curriculum_context',
    'learner_context',
    'adaptive_review_plan',
    'session_mastery_snapshot',
    'answer_disclosure_gate',
    'mistake_pattern_classifier',
    'next_step_coach',
    'board_animation_plan',
    'hint_ladder',
    'integer_operation_scene',
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
  const coachedMove = await tools.next_step_coach.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      studentWork: '1/2 + 1/3 = 2/5',
      goal: 'I am stuck.',
    },
    { ctx: {} as never, toolCallId: 'smoke-next-step-coach' }
  )
  const answerGate = await tools.answer_disclosure_gate.execute(
    {
      studentRequest: 'Just give me the answer.',
      hasStudentAttempt: false,
      attemptCount: 0,
      isCheckingAnswer: false,
      askedForFullSolution: true,
    },
    { ctx: {} as never, toolCallId: 'smoke-answer-disclosure-gate' }
  )
  const reviewPlan = await tools.adaptive_review_plan.execute(
    {
      gradeLevel: 'Grade 5',
      targetTopic: 'fractions',
      sessionGoal: 'continue from last time',
      topics: ['fractions'],
      struggleSignals: ['student says they are stuck'],
      recentExcerpts: ['I got stuck adding 1/2 + 1/3.'],
    },
    { ctx: {} as never, toolCallId: 'smoke-adaptive-review-plan' }
  )
  const integerOperation = await tools.integer_operation_scene.execute(
    {
      left: -3,
      right: 5,
      operation: 'add',
      title: 'Integer operation',
    },
    { ctx: {} as never, toolCallId: 'smoke-integer-operation' }
  )
  const masterySnapshot = await tools.session_mastery_snapshot.execute(
    {
      topic: 'ratios',
      gradeLevel: 'Grade 6',
      transcriptExcerpt: 'I know this is a unit rate because it is the cost for one notebook.',
      studentWork: '3 notebooks cost $12, so one notebook is $4.',
      toolSummary: 'unit_rate returned 4.',
    },
    { ctx: {} as never, toolCallId: 'smoke-session-mastery-snapshot' }
  )
  const mistakePattern = await tools.mistake_pattern_classifier.execute(
    {
      topic: 'fractions',
      studentWork: '1/2 + 1/3 = 2/5',
      studentExplanation: 'I added the numerators and denominators.',
      expectedAnswer: '5/6',
    },
    { ctx: {} as never, toolCallId: 'smoke-mistake-pattern' }
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

  if (!JSON.stringify(coachedMove).includes('askNext')) {
    throw new Error('next_step_coach did not return the next tutor move.')
  }

  if (!JSON.stringify(reviewPlan).includes('diagnosticQuestion')) {
    throw new Error('adaptive_review_plan did not return a review plan.')
  }

  if (!JSON.stringify(integerOperation).includes('"result":2')) {
    throw new Error('integer_operation_scene did not return the signed integer result.')
  }

  if (!JSON.stringify(masterySnapshot).includes('teacherReviewNote')) {
    throw new Error('session_mastery_snapshot did not return a teacher review note.')
  }

  if (!JSON.stringify(mistakePattern).includes('denominator_operation')) {
    throw new Error('mistake_pattern_classifier did not classify the fraction denominator pattern.')
  }

  if (!JSON.stringify(answerGate).includes('hint_only')) {
    throw new Error('answer_disclosure_gate did not preserve productive struggle before an attempt.')
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
