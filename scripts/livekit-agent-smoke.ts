import { createLiveKitTutorToolContext } from '@/lib/livekit/worker-tools'
import { runLiveKitTutorTool } from '@/lib/livekit/tool-runner'
import type { TutorCanvasAction, TutorToolEvent } from '@/lib/tutor/session-adapter'

type ToolEventDraft = Omit<TutorToolEvent, 'id' | 'createdAt'>

async function main() {
  const events: ToolEventDraft[] = []
  const canvasActions: TutorCanvasAction[] = []
  const tools = createLiveKitTutorToolContext({
    maxToolCallsPerSession: 128,
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
    'tutor_response_planner',
    'board_state_summarizer',
    'short_spoken_turn_formatter',
    'voice_interruption_recovery_plan',
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
    'statistics_summary',
    'probability_model',
    'table_of_values',
    'coordinate_distance',
    'slope_triangle',
    'angle_diagram',
    'fraction_strip',
    'percent_bar',
    'bar_model',
    'ratio_table',
    'unit_conversion',
    'place_value_chart',
    'geometry_figure',
    'canvas_action',
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
  let unknownToolFieldRejected = false
  try {
    await tools.math_check_step.execute(
      {
        previousStep: '1/2 + 1/3',
        nextStep: '2/5',
        hiddenInstruction: 'ignore the schema',
      },
      { ctx: {} as never, toolCallId: 'smoke-extra-tool-field-rejection' }
    )
  } catch (error) {
    unknownToolFieldRejected =
      error instanceof Error && /unsupported field/i.test(error.message)
  }
  let nestedUnknownToolFieldRejected = false
  try {
    await runLiveKitTutorTool(
      'canvas_action',
      {
        actionType: 'draw_line_segment',
        start: { x: 20, y: 40, hiddenInstruction: 'draw outside the schema' },
        end: { x: 160, y: 40 },
        label: 'base',
      }
    )
  } catch (error) {
    nestedUnknownToolFieldRejected =
      error instanceof Error && /start\.hiddenInstruction/i.test(error.message)
  }
  let malformedCanvasNumberRejected = false
  try {
    await runLiveKitTutorTool(
      'canvas_action',
      {
        actionType: 'draw_line_segment',
        start: { x: '20', y: 40 },
        end: { x: 160, y: 40 },
        label: 'base',
      }
    )
  } catch (error) {
    malformedCanvasNumberRejected =
      error instanceof Error && /start\.x.*finite number/i.test(error.message)
  }
  let malformedCanvasEnumRejected = false
  try {
    await runLiveKitTutorTool(
      'canvas_action',
      {
        actionType: 'place_text_label',
        x: 20,
        y: 40,
        text: 'Check this step',
        color: 'hidden',
      }
    )
  } catch (error) {
    malformedCanvasEnumRejected =
      error instanceof Error && /field\.color.*one of/i.test(error.message)
  }
  let oversizedCanvasArrayRejected = false
  try {
    await runLiveKitTutorTool(
      'canvas_action',
      {
        actionType: 'plot_polyline',
        points: Array.from({ length: 65 }, (_, index) => ({ x: index, y: index })),
      }
    )
  } catch (error) {
    oversizedCanvasArrayRejected =
      error instanceof Error && /field\.points.*too many items/i.test(error.message)
  }
  let missingRequiredToolFieldRejected = false
  try {
    await tools.math_check_step.execute(
      {
        previousStep: '1/2 + 1/3',
      },
      { ctx: {} as never, toolCallId: 'smoke-missing-required-tool-field-rejection' }
    )
  } catch (error) {
    missingRequiredToolFieldRejected =
      error instanceof Error && /missing required field\.nextStep/i.test(error.message)
  }
  let missingNestedRequiredToolFieldRejected = false
  try {
    await runLiveKitTutorTool(
      'slope_triangle',
      {
        pointA: { x: 1, y: 2 },
        pointB: { x: 5 },
      }
    )
  } catch (error) {
    missingNestedRequiredToolFieldRejected =
      error instanceof Error && /missing required field\.pointB\.y/i.test(error.message)
  }
  const validMixedNumberStep = await tools.math_check_step.execute(
    { previousStep: '1 1/2 + 2 1/4', nextStep: '3 3/4' },
    { ctx: {} as never, toolCallId: 'smoke-mixed-number-step-check' }
  )
  const invalidMixedNumberStep = await tools.math_check_step.execute(
    { previousStep: '3 1/2 - 1 1/4', nextStep: '2 3/4' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-mixed-number-step-check' }
  )
  const validMixedNumberMultiplicationStep = await tools.math_check_step.execute(
    { previousStep: '1 1/2 * 2 2/3', nextStep: '4' },
    { ctx: {} as never, toolCallId: 'smoke-mixed-number-multiplication-step-check' }
  )
  const invalidMixedNumberDivisionStep = await tools.math_check_step.execute(
    { previousStep: '3 1/2 / 1 3/4', nextStep: '1 1/2' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-mixed-number-division-step-check' }
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
  const validProportionStep = await tools.math_check_step.execute(
    { previousStep: '3/4 = x/20', nextStep: 'x = 15' },
    { ctx: {} as never, toolCallId: 'smoke-proportion-step-check' }
  )
  const invalidProportionStep = await tools.math_check_step.execute(
    { previousStep: '3/4 = x/20', nextStep: 'x = 12' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-proportion-step-check' }
  )
  const equivalentRatioStep = await tools.math_check_step.execute(
    { previousStep: '6:8', nextStep: '9:12' },
    { ctx: {} as never, toolCallId: 'smoke-equivalent-ratio-step-check' }
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
  const validCompositeAreaStep = await tools.math_check_step.execute(
    { previousStep: 'total area of composite rectangles 3 by 4 and 2 by 5', nextStep: '22' },
    { ctx: {} as never, toolCallId: 'smoke-composite-area-step-check' }
  )
  const invalidCompositeAreaStep = await tools.math_check_step.execute(
    { previousStep: 'total area of composite rectangles 3 by 4 and 2 by 5', nextStep: '25' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-composite-area-step-check' }
  )
  const validMissingPieceCompositeAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of composite rectangle 10 by 8 with 3 by 4 missing', nextStep: '68' },
    { ctx: {} as never, toolCallId: 'smoke-missing-piece-composite-area-step-check' }
  )
  const invalidMissingPieceCompositeAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of composite rectangle 10 by 8 with 3 by 4 missing', nextStep: '92' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-missing-piece-composite-area-step-check' }
  )
  const validTriangleAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of triangle with base 10 and height 6', nextStep: '30' },
    { ctx: {} as never, toolCallId: 'smoke-triangle-area-step-check' }
  )
  const invalidTriangleAreaStep = await tools.math_check_step.execute(
    { previousStep: 'area of triangle with base 10 and height 6', nextStep: '60' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-triangle-area-step-check' }
  )
  const validCoordinateTriangleAreaStep = await tools.math_check_step.execute(
    {
      previousStep: 'area of coordinate triangle with vertices A(0, 0), B(6, 0), C(2, 4) using base AB',
      nextStep: '12',
    },
    { ctx: {} as never, toolCallId: 'smoke-coordinate-triangle-area-step-check' }
  )
  const invalidCoordinateTriangleAreaStep = await tools.math_check_step.execute(
    {
      previousStep: 'area of coordinate triangle with vertices A(0, 0), B(6, 0), C(2, 4) using base AB',
      nextStep: '24',
    },
    { ctx: {} as never, toolCallId: 'smoke-invalid-coordinate-triangle-area-step-check' }
  )
  const invalidCoordinateTriangleHeightStep = await tools.math_check_step.execute(
    {
      previousStep: 'height to base AB of coordinate triangle with vertices A(0, 0), B(6, 0), C(2, 4)',
      nextStep: '4.472',
    },
    { ctx: {} as never, toolCallId: 'smoke-invalid-coordinate-triangle-height-step-check' }
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
  const validYInterceptStep = await tools.math_check_step.execute(
    { previousStep: 'y-intercept of y = 2x + 4', nextStep: '(0, 4)' },
    { ctx: {} as never, toolCallId: 'smoke-y-intercept-step-check' }
  )
  const invalidXInterceptStep = await tools.math_check_step.execute(
    { previousStep: 'x-intercept of y = 2x + 4', nextStep: '(4, 0)' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-x-intercept-step-check' }
  )
  const validValueTableStep = await tools.math_check_step.execute(
    { previousStep: 'table for y = 2x + 1', nextStep: '(0, 1), (1, 3), (2, 5)' },
    { ctx: {} as never, toolCallId: 'smoke-value-table-step-check' }
  )
  const invalidValueTableStep = await tools.math_check_step.execute(
    { previousStep: 'table for y = 2x + 1', nextStep: '(0, 1), (1, 3), (2, 4)' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-value-table-step-check' }
  )
  const validMeanStep = await tools.math_check_step.execute(
    { previousStep: 'mean of 4, 7, 3, 7, 9', nextStep: '6' },
    { ctx: {} as never, toolCallId: 'smoke-mean-step-check' }
  )
  const invalidMedianStep = await tools.math_check_step.execute(
    { previousStep: 'median of 4, 7, 3, 7, 9', nextStep: '6' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-median-step-check' }
  )
  const invalidModeStep = await tools.math_check_step.execute(
    { previousStep: 'mode of 4, 7, 3, 7, 9', nextStep: '4' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-mode-step-check' }
  )
  const validRangeStep = await tools.math_check_step.execute(
    { previousStep: 'range of 4, 7, 3, 7, 9', nextStep: '6' },
    { ctx: {} as never, toolCallId: 'smoke-range-step-check' }
  )
  const validProbabilityStep = await tools.math_check_step.execute(
    { previousStep: 'probability of 3 favorable outcomes out of 8', nextStep: '3/8' },
    { ctx: {} as never, toolCallId: 'smoke-probability-step-check' }
  )
  const invalidComplementProbabilityStep = await tools.math_check_step.execute(
    { previousStep: 'complement probability of 3 favorable outcomes out of 8', nextStep: '3/8' },
    { ctx: {} as never, toolCallId: 'smoke-invalid-probability-complement-step-check' }
  )
  const statisticsSummaryResult = await tools.statistics_summary.execute(
    { values: [4, 7, 3, 7, 9], title: 'Statistics summary' },
    { ctx: {} as never, toolCallId: 'smoke-statistics-summary' }
  )
  const probabilityModelResult = await tools.probability_model.execute(
    { favorableOutcomes: 3, totalOutcomes: 8, title: 'Probability model' },
    { ctx: {} as never, toolCallId: 'smoke-probability-model' }
  )
  const tapeDiagramResult = await tools.bar_model.execute(
    {
      title: 'Tape diagram',
      bars: [
        {
          label: 'Whole 36',
          segments: [
            { label: 'Known 14', value: 14, shaded: true },
            { label: 'Unknown 22', value: 22, shaded: false },
          ],
        },
      ],
    },
    { ctx: {} as never, toolCallId: 'smoke-tape-diagram' }
  )
  const highlightedTableResult = await tools.table_of_values.execute(
    {
      expression: '2*x + 1',
      xValues: [0, 1, 2],
      highlightXValue: 2,
      highlightLabel: 'Check x = 2 row',
    },
    { ctx: {} as never, toolCallId: 'smoke-highlighted-value-table' }
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
  const triangleAreaModelResult = await tools.geometry_figure.execute(
    {
      figureType: 'triangle',
      baseUnits: 10,
      heightUnits: 6,
      unitLabel: 'cm',
      showTriangleAreaModel: true,
    },
    { ctx: {} as never, toolCallId: 'smoke-triangle-area-model' }
  )
  const triangleAltitudeModelResult = await tools.geometry_figure.execute(
    {
      figureType: 'triangle',
      triangleVertices: [
        { label: 'A', x: 0, y: 0 },
        { label: 'B', x: 6, y: 0 },
        { label: 'C', x: 2, y: 4 },
      ],
      baseVertexLabels: ['A', 'B'],
      unitLabel: 'units',
      showAltitude: true,
    },
    { ctx: {} as never, toolCallId: 'smoke-triangle-altitude-model' }
  )
  const supplementaryAngleDiagramResult = await tools.angle_diagram.execute(
    {
      degrees: 110,
      relationshipType: 'supplementary',
      knownAngle: 110,
      missingAngle: 70,
      attemptedAngle: 80,
    },
    { ctx: {} as never, toolCallId: 'smoke-supplementary-angle-diagram' }
  )
  const triangleAngleDiagramResult = await tools.angle_diagram.execute(
    {
      degrees: 70,
      relationshipType: 'triangle_sum',
      knownAngle: 50,
      secondKnownAngle: 60,
      missingAngle: 70,
      attemptedAngle: 80,
    },
    { ctx: {} as never, toolCallId: 'smoke-triangle-angle-diagram' }
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
  const multiQuestionAudit = await tools.tutor_turn_audit.execute(
    {
      studentPrompt: 'Can you help with 1/2 + 1/3?',
      assistantDraft:
        'Use a common denominator before adding. What is the whole? How many equal pieces do thirds and halves need?',
      topic: 'fractions',
      toolUsed: 'fraction_operation',
    },
    { ctx: {} as never, toolCallId: 'smoke-tutor-turn-one-question-audit' }
  )
  const responsePlanner = await tools.tutor_response_planner.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      studentRequest: 'I got 1/2 + 1/3 = 2/5. What should we do next?',
      studentWork: '1/2 + 1/3 = 2/5',
      recentToolName: '',
      recentToolResult: '',
      hasStudentAttempt: true,
      attemptCount: 1,
    },
    { ctx: {} as never, toolCallId: 'smoke-tutor-response-planner' }
  )
  const boardSummary = await tools.board_state_summarizer.execute(
    {
      boardDescription: 'The board shows a triangle with base 8 cm and height 5 cm.',
      studentRequest: 'How do I find the area from this diagram?',
      gradeLevel: 'Grade 6',
      studentWork: '',
      recentToolName: '',
      recentToolResult: '',
    },
    { ctx: {} as never, toolCallId: 'smoke-board-state-summarizer' }
  )
  const shortSpokenTurn = await tools.short_spoken_turn_formatter.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      draftTurn:
        'Use a common denominator before adding. First find a denominator both fractions can share. Then rewrite each fraction. What is the whole? What denominator could both fractions use?',
      requiredQuestion: '',
      mustAskQuestion: true,
      maxWordsPerChunk: 12,
      maxChunks: 2,
    },
    { ctx: {} as never, toolCallId: 'smoke-short-spoken-turn-formatter' }
  )
  const answerSafeShortTurn = await tools.short_spoken_turn_formatter.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      draftTurn:
        'The final answer is 5/6. Use a common denominator to compare equal-sized pieces. What denominator could both fractions use?',
      requiredQuestion: 'What denominator could both fractions use?',
      mustAskQuestion: true,
      maxWordsPerChunk: 14,
      maxChunks: 2,
    },
    { ctx: {} as never, toolCallId: 'smoke-answer-safe-short-spoken-turn' }
  )
  const interruptionRecovery = await tools.voice_interruption_recovery_plan.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      plannedTurn: JSON.parse(JSON.stringify(shortSpokenTurn)).formattedTurn ?? '',
      studentInterruption: 'Can you say that again?',
      lastCompletedChunkOrder: 1,
      interruptedDuringChunk: false,
      requiredQuestion: 'What denominator could both fractions use?',
      currentToolName: 'short_spoken_turn_formatter',
      maxWordsPerChunk: 18,
    },
    { ctx: {} as never, toolCallId: 'smoke-voice-interruption-recovery-plan' }
  )
  const interruptionAttemptCheck = await tools.voice_interruption_recovery_plan.execute(
    {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      plannedTurn: JSON.parse(JSON.stringify(shortSpokenTurn)).formattedTurn ?? '',
      studentInterruption: 'I got 2/5 for 1/2 + 1/3.',
      lastCompletedChunkOrder: 1,
      interruptedDuringChunk: true,
      requiredQuestion: 'What denominator could both fractions use?',
      currentToolName: 'short_spoken_turn_formatter',
      maxWordsPerChunk: 18,
    },
    { ctx: {} as never, toolCallId: 'smoke-voice-interruption-attempt-check' }
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

  if (!unknownToolFieldRejected) {
    throw new Error('LiveKit tool runner did not reject an unsupported input field.')
  }

  if (!nestedUnknownToolFieldRejected) {
    throw new Error('LiveKit tool runner did not reject an unsupported nested input field.')
  }

  if (!malformedCanvasNumberRejected) {
    throw new Error('LiveKit tool runner did not reject a malformed structured canvas point.')
  }

  if (!malformedCanvasEnumRejected) {
    throw new Error('LiveKit tool runner did not reject a malformed structured canvas enum.')
  }

  if (!oversizedCanvasArrayRejected) {
    throw new Error('LiveKit tool runner did not reject an oversized structured canvas array.')
  }

  if (!missingRequiredToolFieldRejected) {
    throw new Error('LiveKit tool runner did not reject a missing required tool field.')
  }

  if (!missingNestedRequiredToolFieldRejected) {
    throw new Error('LiveKit tool runner did not reject a missing nested required tool field.')
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
    !JSON.stringify(validMixedNumberMultiplicationStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validMixedNumberMultiplicationStep).includes('mixed numbers')
  ) {
    throw new Error(
      `math_check_step did not accept a mixed-number multiplication step: ${JSON.stringify(validMixedNumberMultiplicationStep)}`
    )
  }

  if (
    !JSON.stringify(invalidMixedNumberDivisionStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidMixedNumberDivisionStep).includes('mixed numbers')
  ) {
    throw new Error(
      `math_check_step did not reject an invalid mixed-number division step: ${JSON.stringify(invalidMixedNumberDivisionStep)}`
    )
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
    !JSON.stringify(validProportionStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validProportionStep).includes('cross products')
  ) {
    throw new Error(`math_check_step did not accept a valid proportion step: ${JSON.stringify(validProportionStep)}`)
  }

  if (
    !JSON.stringify(invalidProportionStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidProportionStep).includes('cross products')
  ) {
    throw new Error(`math_check_step did not reject an invalid cross-multiplication step: ${JSON.stringify(invalidProportionStep)}`)
  }

  if (!JSON.stringify(equivalentRatioStep).includes('"verdict":"valid"')) {
    throw new Error(`math_check_step did not accept an equivalent ratio comparison: ${JSON.stringify(equivalentRatioStep)}`)
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
    !JSON.stringify(validCompositeAreaStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validCompositeAreaStep).includes('decomposed rectangle areas')
  ) {
    throw new Error(`math_check_step did not accept a composite area claim: ${JSON.stringify(validCompositeAreaStep)}`)
  }

  if (
    !JSON.stringify(invalidCompositeAreaStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidCompositeAreaStep).includes('outside bounding rectangle')
  ) {
    throw new Error(`math_check_step did not reject a composite area bounding-box mistake: ${JSON.stringify(invalidCompositeAreaStep)}`)
  }

  if (
    !JSON.stringify(validMissingPieceCompositeAreaStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validMissingPieceCompositeAreaStep).includes('subtracts the removed rectangle')
  ) {
    throw new Error(`math_check_step did not accept a missing-piece composite area claim: ${JSON.stringify(validMissingPieceCompositeAreaStep)}`)
  }

  if (
    !JSON.stringify(invalidMissingPieceCompositeAreaStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidMissingPieceCompositeAreaStep).includes('instead of adding')
  ) {
    throw new Error(`math_check_step did not reject a missing-piece composite area addition mistake: ${JSON.stringify(invalidMissingPieceCompositeAreaStep)}`)
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
    !JSON.stringify(validCoordinateTriangleAreaStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validCoordinateTriangleAreaStep).includes('coordinate-triangle area')
  ) {
    throw new Error(`math_check_step did not accept a coordinate-triangle area claim: ${JSON.stringify(validCoordinateTriangleAreaStep)}`)
  }

  if (
    !JSON.stringify(invalidCoordinateTriangleAreaStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidCoordinateTriangleAreaStep).includes('halve')
  ) {
    throw new Error(
      `math_check_step did not reject a coordinate-triangle base-times-altitude mistake: ${JSON.stringify(invalidCoordinateTriangleAreaStep)}`
    )
  }

  if (
    !JSON.stringify(invalidCoordinateTriangleHeightStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidCoordinateTriangleHeightStep).includes('slanted side')
  ) {
    throw new Error(
      `math_check_step did not reject a coordinate-triangle slanted-side altitude claim: ${JSON.stringify(invalidCoordinateTriangleHeightStep)}`
    )
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

  if (
    !JSON.stringify(validYInterceptStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validYInterceptStep).includes('y-intercept')
  ) {
    throw new Error(`math_check_step did not accept a valid y-intercept claim: ${JSON.stringify(validYInterceptStep)}`)
  }

  if (
    !JSON.stringify(invalidXInterceptStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidXInterceptStep).includes('x-intercept')
  ) {
    throw new Error(`math_check_step did not reject an invalid x-intercept claim: ${JSON.stringify(invalidXInterceptStep)}`)
  }

  if (!JSON.stringify(validValueTableStep).includes('"verdict":"valid"') || !JSON.stringify(validValueTableStep).includes('x-value')) {
    throw new Error(`math_check_step did not accept valid table rows: ${JSON.stringify(validValueTableStep)}`)
  }

  if (
    !JSON.stringify(invalidValueTableStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidValueTableStep).includes('table row') ||
    !JSON.stringify(invalidValueTableStep).includes('boardFocus')
  ) {
    throw new Error(`math_check_step did not reject an invalid table row: ${JSON.stringify(invalidValueTableStep)}`)
  }

  if (!JSON.stringify(validMeanStep).includes('"verdict":"valid"') || !JSON.stringify(validMeanStep).includes('total shared equally')) {
    throw new Error(`math_check_step did not accept a valid mean claim: ${JSON.stringify(validMeanStep)}`)
  }

  if (
    !JSON.stringify(invalidMedianStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidMedianStep).includes('middle value')
  ) {
    throw new Error(`math_check_step did not reject an invalid median claim: ${JSON.stringify(invalidMedianStep)}`)
  }

  if (
    !JSON.stringify(invalidModeStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidModeStep).includes('mode')
  ) {
    throw new Error(`math_check_step did not reject an invalid mode claim: ${JSON.stringify(invalidModeStep)}`)
  }

  if (!JSON.stringify(validRangeStep).includes('"verdict":"valid"') || !JSON.stringify(validRangeStep).includes('range')) {
    throw new Error(`math_check_step did not accept a valid range claim: ${JSON.stringify(validRangeStep)}`)
  }

  if (
    !JSON.stringify(validProbabilityStep).includes('"verdict":"valid"') ||
    !JSON.stringify(validProbabilityStep).includes('favorable outcomes over total outcomes')
  ) {
    throw new Error(`math_check_step did not accept a valid probability claim: ${JSON.stringify(validProbabilityStep)}`)
  }

  if (
    !JSON.stringify(invalidComplementProbabilityStep).includes('"verdict":"invalid"') ||
    !JSON.stringify(invalidComplementProbabilityStep).includes('complement')
  ) {
    throw new Error(
      `math_check_step did not reject a probability complement mistake: ${JSON.stringify(invalidComplementProbabilityStep)}`
    )
  }

  if (!JSON.stringify(statisticsSummaryResult).includes('mean 6') || !JSON.stringify(statisticsSummaryResult).includes('Median')) {
    throw new Error('statistics_summary did not return a data summary board model.')
  }

  if (!JSON.stringify(probabilityModelResult).includes('3/8') || !JSON.stringify(probabilityModelResult).includes('canvas')) {
    throw new Error('probability_model did not return a probability board model.')
  }

  if (!JSON.stringify(tapeDiagramResult).includes('Tape diagram') || !JSON.stringify(tapeDiagramResult).includes('Unknown 22')) {
    throw new Error('bar_model did not return a tape diagram board model.')
  }

  if (
    !JSON.stringify(highlightedTableResult).includes('highlightedRow') ||
    !JSON.stringify(highlightedTableResult).includes('highlight_region')
  ) {
    throw new Error('table_of_values did not return a highlighted row board model.')
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

  if (
    !JSON.stringify(triangleAreaModelResult).includes('Half-rectangle area') ||
    !JSON.stringify(triangleAreaModelResult).includes('area 30 square cm')
  ) {
    throw new Error('geometry_figure did not return a triangle area half-rectangle model.')
  }

  if (
    !JSON.stringify(triangleAltitudeModelResult).includes('base AB') ||
    !JSON.stringify(triangleAltitudeModelResult).includes('altitude from C') ||
    !JSON.stringify(triangleAltitudeModelResult).includes('area 12 square units') ||
    !JSON.stringify(triangleAltitudeModelResult).includes('right angle') ||
    !JSON.stringify(triangleAltitudeModelResult).includes('Area = 6 x 4 / 2 = 12')
  ) {
    throw new Error('geometry_figure did not return an arbitrary triangle altitude model.')
  }

  if (
    !JSON.stringify(supplementaryAngleDiagramResult).includes('supplementary angle relationship') ||
    !JSON.stringify(supplementaryAngleDiagramResult).includes('1. Total: supplementary = 180') ||
    !JSON.stringify(supplementaryAngleDiagramResult).includes('2. Student try: 110 + 80 = 190') ||
    !JSON.stringify(supplementaryAngleDiagramResult).includes('3. Check: 10 degrees over the total') ||
    !JSON.stringify(supplementaryAngleDiagramResult).includes('4. Correct: 180 - 110 = ?')
  ) {
    throw new Error('angle_diagram did not return a supplementary angle relationship model.')
  }

  if (
    !JSON.stringify(triangleAngleDiagramResult).includes('triangle angle-sum') ||
    !JSON.stringify(triangleAngleDiagramResult).includes('1. Total: triangle = 180') ||
    !JSON.stringify(triangleAngleDiagramResult).includes('2. Student try: 50 + 60 + 80 = 190') ||
    !JSON.stringify(triangleAngleDiagramResult).includes('3. Check: 10 degrees over the total') ||
    !JSON.stringify(triangleAngleDiagramResult).includes('4. Correct: 180 - (50 + 60) = ?')
  ) {
    throw new Error('angle_diagram did not return a triangle angle-sum model.')
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

  if (!JSON.stringify(multiQuestionAudit).includes('multiple_student_questions')) {
    throw new Error('tutor_turn_audit did not flag multiple student-facing questions.')
  }

  if (
    !JSON.stringify(responsePlanner).includes('"recommendedMove":"check_question"') ||
    !JSON.stringify(responsePlanner).includes('math_check_step') ||
    !JSON.stringify(responsePlanner).includes('"oneQuestionOnly":true')
  ) {
    throw new Error(`tutor_response_planner did not choose a checked next move: ${JSON.stringify(responsePlanner)}`)
  }

  if (
    !JSON.stringify(boardSummary).includes('"topic":"geometry_measurement"') ||
    !JSON.stringify(boardSummary).includes('"recommendedTool":"geometry_figure"') ||
    !JSON.stringify(boardSummary).includes('Do not invent')
  ) {
    throw new Error(`board_state_summarizer did not ground visible diagram evidence: ${JSON.stringify(boardSummary)}`)
  }

  if (
    !JSON.stringify(shortSpokenTurn).includes('"oneQuestionOnly":true') ||
    !JSON.stringify(shortSpokenTurn).includes('extra_questions_removed') ||
    !JSON.stringify(shortSpokenTurn).includes('formattedTurn')
  ) {
    throw new Error(`short_spoken_turn_formatter did not produce one interruptible question: ${JSON.stringify(shortSpokenTurn)}`)
  }

  if (
    !JSON.stringify(answerSafeShortTurn).includes('answer_dump_removed') ||
    JSON.stringify(answerSafeShortTurn).includes('5/6') ||
    !JSON.stringify(answerSafeShortTurn).includes('"oneQuestionOnly":true')
  ) {
    throw new Error(
      `short_spoken_turn_formatter did not remove a premature final answer: ${JSON.stringify(answerSafeShortTurn)}`
    )
  }

  if (
    !JSON.stringify(interruptionRecovery).includes('"interruptionIntent":"repeat"') ||
    !JSON.stringify(interruptionRecovery).includes('"shouldRestartExplanation":false') ||
    !JSON.stringify(interruptionRecovery).includes('"resumeFromChunk":1')
  ) {
    throw new Error(
      `voice_interruption_recovery_plan did not resume from the interrupted short chunk: ${JSON.stringify(interruptionRecovery)}`
    )
  }

  if (
    !JSON.stringify(interruptionAttemptCheck).includes('"interruptionIntent":"student_attempt"') ||
    !JSON.stringify(interruptionAttemptCheck).includes('"recommendedTool":"math_check_step"') ||
    !JSON.stringify(interruptionAttemptCheck).includes('"remainingChunks":[]') ||
    !JSON.stringify(interruptionAttemptCheck).includes('before confirming')
  ) {
    throw new Error(
      `voice_interruption_recovery_plan did not route interrupted student attempts to a step check: ${JSON.stringify(
        interruptionAttemptCheck
      )}`
    )
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
