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
    'exit_ticket_builder',
    'tutor_turn_audit',
    'student_check_question',
    'answer_disclosure_gate',
    'mistake_pattern_classifier',
    'next_step_coach',
    'board_animation_plan',
    'hint_ladder',
    'integer_operation_scene',
    'problem_understanding_map',
    'representation_bridge',
    'worked_example_fader',
    'graph_function',
    'coordinate_distance',
    'fraction_strip',
    'percent_bar',
    'ratio_table',
    'unit_conversion',
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
  const invalidFractionStep = await tools.math_check_step.execute(
    { previousStep: '1/2 + 1/3', nextStep: '2/5' },
    { ctx: {} as never, toolCallId: 'smoke-fraction-step-check' }
  )
  const validLinearStep = await tools.math_check_step.execute(
    { previousStep: '2x + 3 = 11', nextStep: '2x = 8' },
    { ctx: {} as never, toolCallId: 'smoke-linear-step-check' }
  )
  const validPercentStep = await tools.math_check_step.execute(
    { previousStep: '25% of 80', nextStep: '20' },
    { ctx: {} as never, toolCallId: 'smoke-percent-step-check' }
  )
  const invalidDecimalStep = await tools.math_check_step.execute(
    { previousStep: '0.4 + 0.08', nextStep: '0.12' },
    { ctx: {} as never, toolCallId: 'smoke-decimal-step-check' }
  )
  const validRatioStep = await tools.math_check_step.execute(
    { previousStep: '3:12', nextStep: '1:4' },
    { ctx: {} as never, toolCallId: 'smoke-ratio-step-check' }
  )
  const invalidRatioStep = await tools.math_check_step.execute(
    { previousStep: '3:12', nextStep: '1:3' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-ratio-step-check' }
  )
  const invalidIntegerSignStep = await tools.math_check_step.execute(
    { previousStep: '-3 - 5', nextStep: '2' },
    { ctx: {} as never, toolCallId: 'smoke-integer-sign-step-check' }
  )
  const validUnitConversionStep = await tools.math_check_step.execute(
    { previousStep: '2.5 m', nextStep: '250 cm' },
    { ctx: {} as never, toolCallId: 'smoke-unit-conversion-step-check' }
  )
  const invalidUnitConversionStep = await tools.math_check_step.execute(
    { previousStep: '3 kg', nextStep: '300 g' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-unit-conversion-step-check' }
  )
  const invalidCoordinatePointStep = await tools.math_check_step.execute(
    { previousStep: 'y = 2x + 1', nextStep: '(2, 4)' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-coordinate-point-step-check' }
  )
  const validCoordinateDistanceStep = await tools.math_check_step.execute(
    { previousStep: 'distance from (2, 3) to (5, 7)', nextStep: '5' },
    { ctx: {} as never, toolCallId: 'smoke-coordinate-distance-step-check' }
  )
  const invalidCoordinateDistanceStep = await tools.math_check_step.execute(
    { previousStep: 'distance from (2, 3) to (5, 7)', nextStep: '4' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-coordinate-distance-step-check' }
  )
  const invalidNumericEqualityStep = await tools.math_check_step.execute(
    { previousStep: '3/4 = 6/8', nextStep: '3/4 = 7/8' },
    { ctx: {} as never, toolCallId: 'smoke-numeric-equality-step-check' }
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
  const exitTicket = await tools.exit_ticket_builder.execute(
    {
      topic: 'ratios',
      gradeLevel: 'Grade 6',
      sessionGoal: 'wrap up unit rate practice',
      studentEvidence: 'Student found 12 dollars for 3 notebooks means 4 dollars per notebook.',
      difficulty: 'core',
      count: 2,
    },
    { ctx: {} as never, toolCallId: 'smoke-exit-ticket-builder' }
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
  const problemMap = await tools.problem_understanding_map.execute(
    {
      problemText: 'A recipe uses 3 cups of flour for 12 muffins. How many cups are needed for 20 muffins?',
      gradeLevel: 'Grade 6',
      studentWork: '',
    },
    { ctx: {} as never, toolCallId: 'smoke-problem-understanding-map' }
  )
  const turnAudit = await tools.tutor_turn_audit.execute(
    {
      studentPrompt: 'Can you help with 1/2 + 1/3?',
      assistantDraft: 'The final answer is 5/6.',
      topic: 'fractions',
      toolUsed: 'fraction_operation',
    },
    { ctx: {} as never, toolCallId: 'smoke-tutor-turn-audit' }
  )
  const checkQuestion = await tools.student_check_question.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      studentWork: '1/2 + 1/3 = 2/5',
      recentToolName: 'fraction_operation',
      recentToolResult: 'A common denominator is needed.',
      checkType: 'error_spotting',
    },
    { ctx: {} as never, toolCallId: 'smoke-student-check-question' }
  )
  const bridge = await tools.representation_bridge.execute(
    {
      topic: 'ratios',
      problemContext: '3 notebooks cost 12 dollars',
      fromRepresentation: 'words',
      toRepresentation: 'table',
      studentWork: '',
    },
    { ctx: {} as never, toolCallId: 'smoke-representation-bridge' }
  )
  const fadedExample = await tools.worked_example_fader.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      exampleProblem: 'Add 1/2 + 1/3',
      studentWork: '',
    },
    { ctx: {} as never, toolCallId: 'smoke-worked-example-fader' }
  )

  if (!JSON.stringify(mathResult).includes('1.25')) {
    throw new Error(`Unexpected math_calculate result: ${JSON.stringify(mathResult)}`)
  }

  if (!JSON.stringify(invalidFractionStep).includes('"verdict":"invalid"')) {
    throw new Error(`math_check_step did not reject an invalid fraction step: ${JSON.stringify(invalidFractionStep)}`)
  }

  if (!JSON.stringify(validLinearStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept a balanced linear step: ${JSON.stringify(validLinearStep)}`)
  }

  if (!JSON.stringify(validPercentStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept percent-of wording: ${JSON.stringify(validPercentStep)}`)
  }

  if (
    !JSON.stringify(invalidDecimalStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidDecimalStep).includes('decimal place values')
  ) {
    throw new Error(`math_check_step did not reject a decimal place-value mistake: ${JSON.stringify(invalidDecimalStep)}`)
  }

  if (!JSON.stringify(validRatioStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept equivalent ratio simplification: ${JSON.stringify(validRatioStep)}`)
  }

  if (
    !JSON.stringify(invalidRatioStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidRatioStep).includes('ratio')
  ) {
    throw new Error(`math_check_step did not reject an invalid ratio simplification: ${JSON.stringify(invalidRatioStep)}`)
  }

  if (
    !JSON.stringify(invalidIntegerSignStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidIntegerSignStep).includes('integer signs')
  ) {
    throw new Error(`math_check_step did not reject a signed-integer mistake: ${JSON.stringify(invalidIntegerSignStep)}`)
  }

  if (!JSON.stringify(validUnitConversionStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept an equivalent unit conversion: ${JSON.stringify(validUnitConversionStep)}`)
  }

  if (
    !JSON.stringify(invalidUnitConversionStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidUnitConversionStep).includes('conversion factor')
  ) {
    throw new Error(`math_check_step did not reject an invalid unit conversion: ${JSON.stringify(invalidUnitConversionStep)}`)
  }

  if (
    !JSON.stringify(invalidCoordinatePointStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidCoordinatePointStep).includes('x-coordinate')
  ) {
    throw new Error(`math_check_step did not reject an invalid plotted point: ${JSON.stringify(invalidCoordinatePointStep)}`)
  }

  if (!JSON.stringify(validCoordinateDistanceStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept a correct coordinate distance: ${JSON.stringify(validCoordinateDistanceStep)}`)
  }

  if (
    !JSON.stringify(invalidCoordinateDistanceStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidCoordinateDistanceStep).includes('horizontal and vertical changes')
  ) {
    throw new Error(`math_check_step did not reject an invalid coordinate distance: ${JSON.stringify(invalidCoordinateDistanceStep)}`)
  }

  if (!JSON.stringify(invalidNumericEqualityStep).includes('"verdict":"invalid"')) {
    throw new Error(`math_check_step did not reject a false numeric equality: ${JSON.stringify(invalidNumericEqualityStep)}`)
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

  if (!JSON.stringify(exitTicket).includes('answerKey')) {
    throw new Error('exit_ticket_builder did not return reviewable exit-ticket items.')
  }

  if (!JSON.stringify(mistakePattern).includes('denominator_operation')) {
    throw new Error('mistake_pattern_classifier did not classify the fraction denominator pattern.')
  }

  if (!JSON.stringify(problemMap).includes('knownQuantities')) {
    throw new Error('problem_understanding_map did not return known quantities.')
  }

  if (!JSON.stringify(turnAudit).includes('answer_dumping')) {
    throw new Error('tutor_turn_audit did not flag answer dumping.')
  }

  if (!JSON.stringify(checkQuestion).includes('expectedEvidence')) {
    throw new Error('student_check_question did not return evidence to listen for.')
  }

  if (!JSON.stringify(bridge).includes('ratio_table')) {
    throw new Error('representation_bridge did not recommend a ratio table.')
  }

  if (!JSON.stringify(fadedExample).includes('you_do')) {
    throw new Error('worked_example_fader did not include a you-do phase.')
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
