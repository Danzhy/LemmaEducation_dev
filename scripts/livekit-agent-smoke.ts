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
    'slope_triangle',
    'fraction_strip',
    'percent_bar',
    'ratio_table',
    'unit_conversion',
    'place_value_chart',
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
  const validMixedNumberStep = await tools.math_check_step.execute(
    { previousStep: '1 1/2 + 2 1/4', nextStep: '3 3/4' },
    { ctx: {} as never, toolCallId: 'smoke-mixed-number-step-check' }
  )
  const invalidMixedNumberStep = await tools.math_check_step.execute(
    { previousStep: '3 1/2 - 1 1/4', nextStep: '2 3/4' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-mixed-number-step-check' }
  )
  const validDistributiveStep = await tools.math_check_step.execute(
    { previousStep: '3(x + 4)', nextStep: '3x + 12' },
    { ctx: {} as never, toolCallId: 'smoke-distributive-step-check' }
  )
  const invalidDistributiveStep = await tools.math_check_step.execute(
    { previousStep: '3(x + 4)', nextStep: '3x + 4' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-distributive-step-check' }
  )
  const validLikeTermsStep = await tools.math_check_step.execute(
    { previousStep: '2x + 3x + 4', nextStep: '5x + 4' },
    { ctx: {} as never, toolCallId: 'smoke-like-terms-step-check' }
  )
  const invalidLikeTermsStep = await tools.math_check_step.execute(
    { previousStep: '2x + 3x + 4', nextStep: '9x' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-like-terms-step-check' }
  )
  const validLinearStep = await tools.math_check_step.execute(
    { previousStep: '2x + 3 = 11', nextStep: '2x = 8' },
    { ctx: {} as never, toolCallId: 'smoke-linear-step-check' }
  )
  const invalidLinearBalanceStep = await tools.math_check_step.execute(
    { previousStep: '2x + 3 = 11', nextStep: '2x = 14' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-linear-balance-step-check' }
  )
  const invalidOrderOfOperationsStep = await tools.math_check_step.execute(
    { previousStep: '3 + 4 * 2', nextStep: '14' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-order-step-check' }
  )
  const validPercentStep = await tools.math_check_step.execute(
    { previousStep: '25% of 80', nextStep: '20' },
    { ctx: {} as never, toolCallId: 'smoke-percent-step-check' }
  )
  const validPercentChangeStep = await tools.math_check_step.execute(
    { previousStep: 'from 80 to 100', nextStep: '25% increase' },
    { ctx: {} as never, toolCallId: 'smoke-percent-change-step-check' }
  )
  const invalidPercentChangeStep = await tools.math_check_step.execute(
    { previousStep: 'from 80 to 100', nextStep: '20% increase' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-percent-change-step-check' }
  )
  const validPercentErrorStep = await tools.math_check_step.execute(
    { previousStep: 'actual 50, measured 48', nextStep: '4% error' },
    { ctx: {} as never, toolCallId: 'smoke-percent-error-step-check' }
  )
  const invalidPercentErrorStep = await tools.math_check_step.execute(
    { previousStep: 'actual 50, measured 48', nextStep: '2% error' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-percent-error-step-check' }
  )
  const validDecimalRoundingStep = await tools.math_check_step.execute(
    { previousStep: 'round 3.746 to nearest hundredths', nextStep: '3.75' },
    { ctx: {} as never, toolCallId: 'smoke-decimal-rounding-step-check' }
  )
  const invalidDecimalRoundingStep = await tools.math_check_step.execute(
    { previousStep: 'round 3.746 to nearest hundredths', nextStep: '3.74' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-decimal-rounding-step-check' }
  )
  const validPlaceValueDigitStep = await tools.math_check_step.execute(
    { previousStep: 'digit in hundredths place of 3.746', nextStep: '4' },
    { ctx: {} as never, toolCallId: 'smoke-place-value-digit-step-check' }
  )
  const invalidPlaceValueDigitStep = await tools.math_check_step.execute(
    { previousStep: 'digit in hundreds place of 4,732', nextStep: '3' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-place-value-digit-step-check' }
  )
  const invalidPlaceValueValueStep = await tools.math_check_step.execute(
    { previousStep: 'value of 7 in 4,732', nextStep: '70' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-place-value-value-step-check' }
  )
  const unclearRepeatedDigitValueStep = await tools.math_check_step.execute(
    { previousStep: 'value of 2 in 2,020', nextStep: '20' },
    { ctx: {} as never, toolCallId: 'smoke-repeated-place-value-value-step-check' }
  )
  const highlightedPlaceValueChart = await tools.place_value_chart.execute(
    {
      columns: ['thousands', 'hundreds', 'tens', 'ones'],
      rows: [{ label: '4,732', values: ['4', '7', '3', '2'] }],
      highlightColumn: 'hundreds',
    },
    { ctx: {} as never, toolCallId: 'smoke-place-value-chart' }
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
  const validRectangleAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of rectangle 7 by 4', nextStep: '28' },
    { ctx: {} as never, toolCallId: 'smoke-rectangle-area-step-check' }
  )
  const invalidRectangleAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of rectangle 7 by 4', nextStep: '22' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-rectangle-area-step-check' }
  )
  const validRectanglePerimeterStep = await tools.math_check_step.execute(
    { previousStep: 'perimeter of rectangle 7 by 4', nextStep: '22' },
    { ctx: {} as never, toolCallId: 'smoke-rectangle-perimeter-step-check' }
  )
  const validTriangleAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of triangle with base 10 and height 6', nextStep: '30' },
    { ctx: {} as never, toolCallId: 'smoke-triangle-area-step-check' }
  )
  const invalidTriangleAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of triangle with base 10 and height 6', nextStep: '60' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-triangle-area-step-check' }
  )
  const validComplementaryAngleStep = await tools.math_check_step.execute(
    { previousStep: 'complementary angle to 35', nextStep: '55' },
    { ctx: {} as never, toolCallId: 'smoke-complementary-angle-step-check' }
  )
  const invalidSupplementaryAngleStep = await tools.math_check_step.execute(
    { previousStep: 'supplementary angle to 110', nextStep: '80' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-supplementary-angle-step-check' }
  )
  const invalidTriangleAngleStep = await tools.math_check_step.execute(
    { previousStep: 'missing angle in triangle with angles 50 and 60', nextStep: '80' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-triangle-angle-step-check' }
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
  const validSlopeStep = await tools.math_check_step.execute(
    { previousStep: 'slope from (1, 2) to (5, 6)', nextStep: '1' },
    { ctx: {} as never, toolCallId: 'smoke-slope-step-check' }
  )
  const invalidSlopeStep = await tools.math_check_step.execute(
    { previousStep: 'slope from (1, 2) to (5, 6)', nextStep: '4' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-slope-step-check' }
  )
  const invalidNumericEqualityStep = await tools.math_check_step.execute(
    { previousStep: '3/4 = 6/8', nextStep: '3/4 = 7/8' },
    { ctx: {} as never, toolCallId: 'smoke-numeric-equality-step-check' }
  )
  const graphResult = await tools.graph_function.execute(
    { expression: '2*x + 1' },
    { ctx: {} as never, toolCallId: 'smoke-graph' }
  )
  const slopeTriangleResult = await tools.slope_triangle.execute(
    { pointA: { x: 1, y: 2 }, pointB: { x: 5, y: 6 } },
    { ctx: {} as never, toolCallId: 'smoke-slope-triangle' }
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

  if (!JSON.stringify(validMixedNumberStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept an equivalent mixed-number step: ${JSON.stringify(validMixedNumberStep)}`)
  }

  if (
    !JSON.stringify(invalidMixedNumberStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidMixedNumberStep).includes('mixed numbers')
  ) {
    throw new Error(`math_check_step did not reject an invalid mixed-number step: ${JSON.stringify(invalidMixedNumberStep)}`)
  }

  if (
    !JSON.stringify(validDistributiveStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validDistributiveStep).includes('distributive property')
  ) {
    throw new Error(`math_check_step did not accept a distributive-property step: ${JSON.stringify(validDistributiveStep)}`)
  }

  if (
    !JSON.stringify(invalidDistributiveStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidDistributiveStep).includes('distributive property')
  ) {
    throw new Error(`math_check_step did not reject a distributive-property mistake: ${JSON.stringify(invalidDistributiveStep)}`)
  }

  if (
    !JSON.stringify(validLikeTermsStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validLikeTermsStep).includes('like terms')
  ) {
    throw new Error(`math_check_step did not accept a like-term step: ${JSON.stringify(validLikeTermsStep)}`)
  }

  if (
    !JSON.stringify(invalidLikeTermsStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidLikeTermsStep).includes('like terms')
  ) {
    throw new Error(`math_check_step did not reject an invalid like-term step: ${JSON.stringify(invalidLikeTermsStep)}`)
  }

  if (!JSON.stringify(validLinearStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept a balanced linear step: ${JSON.stringify(validLinearStep)}`)
  }

  if (
    !JSON.stringify(invalidLinearBalanceStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidLinearBalanceStep).includes('changed differently')
  ) {
    throw new Error(`math_check_step did not explain an invalid linear balance step: ${JSON.stringify(invalidLinearBalanceStep)}`)
  }

  if (
    !JSON.stringify(invalidOrderOfOperationsStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidOrderOfOperationsStep).includes('multiplication or division')
  ) {
    throw new Error(`math_check_step did not reject an order-of-operations mistake: ${JSON.stringify(invalidOrderOfOperationsStep)}`)
  }

  if (!JSON.stringify(validPercentStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept percent-of wording: ${JSON.stringify(validPercentStep)}`)
  }

  if (!JSON.stringify(validPercentChangeStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept a percent-change step: ${JSON.stringify(validPercentChangeStep)}`)
  }

  if (
    !JSON.stringify(invalidPercentChangeStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidPercentChangeStep).includes('percent-change base')
  ) {
    throw new Error(`math_check_step did not reject a percent-change base mistake: ${JSON.stringify(invalidPercentChangeStep)}`)
  }

  if (
    !JSON.stringify(validPercentErrorStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validPercentErrorStep).includes('percent-error base')
  ) {
    throw new Error(`math_check_step did not accept a percent-error step: ${JSON.stringify(validPercentErrorStep)}`)
  }

  if (
    !JSON.stringify(invalidPercentErrorStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidPercentErrorStep).includes('percent-error base')
  ) {
    throw new Error(`math_check_step did not reject a percent-error base mistake: ${JSON.stringify(invalidPercentErrorStep)}`)
  }

  if (
    !JSON.stringify(validDecimalRoundingStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validDecimalRoundingStep).includes('next digit')
  ) {
    throw new Error(`math_check_step did not accept a decimal rounding step: ${JSON.stringify(validDecimalRoundingStep)}`)
  }

  if (
    !JSON.stringify(invalidDecimalRoundingStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidDecimalRoundingStep).includes('target place')
  ) {
    throw new Error(`math_check_step did not reject a decimal rounding mistake: ${JSON.stringify(invalidDecimalRoundingStep)}`)
  }

  if (
    !JSON.stringify(validPlaceValueDigitStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validPlaceValueDigitStep).includes('hundredths')
  ) {
    throw new Error(`math_check_step did not accept a decimal place-value digit claim: ${JSON.stringify(validPlaceValueDigitStep)}`)
  }

  if (
    !JSON.stringify(invalidPlaceValueDigitStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidPlaceValueDigitStep).includes('hundreds')
  ) {
    throw new Error(`math_check_step did not reject a whole-number place-value digit mistake: ${JSON.stringify(invalidPlaceValueDigitStep)}`)
  }

  if (
    !JSON.stringify(invalidPlaceValueValueStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidPlaceValueValueStep).includes("digit's place")
  ) {
    throw new Error(`math_check_step did not reject a digit-value mistake: ${JSON.stringify(invalidPlaceValueValueStep)}`)
  }

  if (
    !JSON.stringify(unclearRepeatedDigitValueStep).includes('"verdict":"unclear"') ||
    !JSON.stringify(unclearRepeatedDigitValueStep).includes('more than one 2') ||
    !JSON.stringify(unclearRepeatedDigitValueStep).includes('naming its place')
  ) {
    throw new Error(`math_check_step did not clarify repeated digit-value prompts: ${JSON.stringify(unclearRepeatedDigitValueStep)}`)
  }

  if (
    !JSON.stringify(highlightedPlaceValueChart).includes('highlight_region') ||
    !JSON.stringify(highlightedPlaceValueChart).includes('Focus: hundreds place')
  ) {
    throw new Error(`place_value_chart did not highlight the requested place: ${JSON.stringify(highlightedPlaceValueChart)}`)
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
    !JSON.stringify(validRectangleAreaStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validRectangleAreaStep).includes('square units')
  ) {
    throw new Error(`math_check_step did not accept a rectangle area claim: ${JSON.stringify(validRectangleAreaStep)}`)
  }

  if (
    !JSON.stringify(invalidRectangleAreaStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidRectangleAreaStep).includes('area from perimeter')
  ) {
    throw new Error(`math_check_step did not reject a rectangle area/perimeter mixup: ${JSON.stringify(invalidRectangleAreaStep)}`)
  }

  if (
    !JSON.stringify(validRectanglePerimeterStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validRectanglePerimeterStep).includes('boundary')
  ) {
    throw new Error(`math_check_step did not accept a rectangle perimeter claim: ${JSON.stringify(validRectanglePerimeterStep)}`)
  }

  if (
    !JSON.stringify(validTriangleAreaStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validTriangleAreaStep).includes('half')
  ) {
    throw new Error(`math_check_step did not accept a triangle area claim: ${JSON.stringify(validTriangleAreaStep)}`)
  }

  if (
    !JSON.stringify(invalidTriangleAreaStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidTriangleAreaStep).includes('halve')
  ) {
    throw new Error(`math_check_step did not reject a triangle area base-times-height mistake: ${JSON.stringify(invalidTriangleAreaStep)}`)
  }

  if (
    !JSON.stringify(validComplementaryAngleStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validComplementaryAngleStep).includes('90 degree total')
  ) {
    throw new Error(`math_check_step did not accept a complementary angle claim: ${JSON.stringify(validComplementaryAngleStep)}`)
  }

  if (
    !JSON.stringify(invalidSupplementaryAngleStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidSupplementaryAngleStep).includes('180 degrees')
  ) {
    throw new Error(`math_check_step did not reject a supplementary angle mistake: ${JSON.stringify(invalidSupplementaryAngleStep)}`)
  }

  if (
    !JSON.stringify(invalidTriangleAngleStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidTriangleAngleStep).includes('subtract from 180')
  ) {
    throw new Error(`math_check_step did not reject a triangle angle-sum mistake: ${JSON.stringify(invalidTriangleAngleStep)}`)
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

  if (!JSON.stringify(validSlopeStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept a correct slope claim: ${JSON.stringify(validSlopeStep)}`)
  }

  if (
    !JSON.stringify(invalidSlopeStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidSlopeStep).includes('rise over run')
  ) {
    throw new Error(`math_check_step did not reject an invalid slope claim: ${JSON.stringify(invalidSlopeStep)}`)
  }

  if (!JSON.stringify(invalidNumericEqualityStep).includes('"verdict":"invalid"')) {
    throw new Error(`math_check_step did not reject a false numeric equality: ${JSON.stringify(invalidNumericEqualityStep)}`)
  }

  if (canvasActions.length === 0 || !JSON.stringify(graphResult).includes('canvas')) {
    throw new Error('graph_function did not produce board-renderable actions.')
  }

  if (!JSON.stringify(slopeTriangleResult).includes('slope')) {
    throw new Error('slope_triangle did not return a slope board model.')
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
