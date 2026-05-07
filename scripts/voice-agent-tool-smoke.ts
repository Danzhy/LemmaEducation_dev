import {
  angleDiagramScene,
  areaPerimeterModelScene,
  arrayModelScene,
  barModelScene,
  compositeAreaModelScene,
  coordinateDistanceScene,
  curriculumCoach,
  dataDisplayScene,
  decimalGridScene,
  doubleNumberLineScene,
  equationBalanceScene,
  factorTreeScene,
  fractionCompareScene,
  fractionOperationScene,
  fractionStripScene,
  graphFunction,
  integerChipsScene,
  longDivisionScene,
  mathCheckAnswer,
  misconceptionDiagnosis,
  numberLineScene,
  orderOfOperationsScene,
  placeValueChartScene,
  plotPointsOnPlane,
  practiceSetGenerator,
  percentBarScene,
  probabilityModelScene,
  ratioTableScene,
  socraticMovePlanner,
  slopeTriangleScene,
  statisticsSummaryScene,
  tableOfValues,
  unitConversionScene,
  wordProblemPlan,
} from '../lib/voice-agent/math-engine'

type SmokeCase = {
  name: string
  run: () => unknown
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertCanvasResult(name: string, result: unknown) {
  assert(result && typeof result === 'object', `${name} did not return an object.`)
  const maybeResult = result as { canvasActions?: unknown }
  assert(Array.isArray(maybeResult.canvasActions), `${name} did not return canvasActions.`)
  assert(maybeResult.canvasActions.length > 0, `${name} returned no canvas actions.`)
}

const smokeCases: SmokeCase[] = [
  {
    name: 'graph_function',
    run: () => graphFunction({ expression: 'x^2-4', showXIntercepts: true, showYIntercept: true, showVertex: true }),
  },
  {
    name: 'plot_points_on_plane',
    run: () => plotPointsOnPlane({ points: [{ x: 0, y: 1 }, { x: 2, y: 5 }], connectPoints: true }),
  },
  {
    name: 'table_of_values',
    run: () => tableOfValues({ expression: '2*x+1', xValues: [0, 1, 2] }),
  },
  {
    name: 'number_line',
    run: () => numberLineScene({ start: -5, end: 5, highlightValues: [-3, 2], hopPairs: [{ from: -3, to: 2 }] }),
  },
  {
    name: 'fraction_strip',
    run: () => fractionStripScene({ numerator: 5, denominator: 4 }),
  },
  {
    name: 'fraction_compare',
    run: () => fractionCompareScene({ leftNumerator: 3, leftDenominator: 4, rightNumerator: 5, rightDenominator: 8 }),
  },
  {
    name: 'fraction_operation',
    run: () => fractionOperationScene({ operation: 'add', leftNumerator: 2, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 }),
  },
  {
    name: 'decimal_grid',
    run: () => decimalGridScene({ shadedParts: 37, totalParts: 100 }),
  },
  {
    name: 'array_model',
    run: () => arrayModelScene({ rows: 4, columns: 6 }),
  },
  {
    name: 'long_division',
    run: () => longDivisionScene({ dividend: 847, divisor: 6 }),
  },
  {
    name: 'integer_chips',
    run: () => integerChipsScene({ positiveCount: 5, negativeCount: 3 }),
  },
  {
    name: 'ratio_table',
    run: () => ratioTableScene({ leftLabel: 'cups', rightLabel: 'people', rows: [{ left: 2, right: 4 }, { left: 3, right: 6 }] }),
  },
  {
    name: 'data_display',
    run: () => dataDisplayScene({ displayType: 'bar_chart', data: [{ label: 'A', value: 4 }, { label: 'B', value: 7 }] }),
  },
  {
    name: 'statistics_summary',
    run: () => statisticsSummaryScene({ values: [4, 7, 3, 7, 9] }),
  },
  {
    name: 'probability_model',
    run: () => probabilityModelScene({ favorableOutcomes: 3, totalOutcomes: 8 }),
  },
  {
    name: 'percent_bar',
    run: () => percentBarScene({ part: 18, total: 60 }),
  },
  {
    name: 'double_number_line',
    run: () => doubleNumberLineScene({ topLabel: 'notebooks', bottomLabel: 'dollars', pairs: [{ top: 0, bottom: 0 }, { top: 3, bottom: 12 }, { top: 6, bottom: 24 }] }),
  },
  {
    name: 'unit_conversion',
    run: () => unitConversionScene({ value: 2.5, fromUnit: 'm', toUnit: 'cm', measurementType: 'length' }),
  },
  {
    name: 'bar_model',
    run: () => barModelScene({ bars: [{ label: 'Total', segments: [{ label: 'Known', value: 5, shaded: true }, { label: '?', value: 7, shaded: false }] }] }),
  },
  {
    name: 'place_value_chart',
    run: () => placeValueChartScene({ columns: ['ones', 'tenths', 'hundredths'], rows: [{ label: '3.47', values: [3, 4, 7] }] }),
  },
  {
    name: 'factor_tree',
    run: () => factorTreeScene({ value: 84 }),
  },
  {
    name: 'area_perimeter_model',
    run: () => areaPerimeterModelScene({ widthUnits: 7, heightUnits: 4, unitLabel: 'cm' }),
  },
  {
    name: 'composite_area_model',
    run: () => compositeAreaModelScene({ unitLabel: 'cm', rectangles: [{ xUnits: 0, yUnits: 0, widthUnits: 3, heightUnits: 4 }, { xUnits: 3, yUnits: 0, widthUnits: 2, heightUnits: 5 }] }),
  },
  {
    name: 'order_of_operations',
    run: () => orderOfOperationsScene({ expression: '3+4*2' }),
  },
  {
    name: 'slope_triangle',
    run: () => slopeTriangleScene({ pointA: { x: 1, y: 2 }, pointB: { x: 5, y: 6 } }),
  },
  {
    name: 'coordinate_distance',
    run: () => coordinateDistanceScene({ pointA: { x: 2, y: 3 }, pointB: { x: 5, y: 7 } }),
  },
  {
    name: 'angle_diagram',
    run: () => angleDiagramScene({ degrees: 75 }),
  },
  {
    name: 'equation_balance',
    run: () => equationBalanceScene({ leftExpression: 'x+3', rightExpression: '10' }),
  },
]

for (const smokeCase of smokeCases) {
  assertCanvasResult(smokeCase.name, smokeCase.run())
}

const correctAnswer = mathCheckAnswer({ problemExpression: '3/4+2/3', studentAnswer: '17/12' })
assert(correctAnswer.verdict === 'correct', 'math_check_answer should mark 17/12 as correct.')

const coach = curriculumCoach({ topic: 'ratios', gradeLevel: 'Grade 6' })
assert(
  (coach.recommendedTools as readonly string[]).includes('double_number_line'),
  'curriculum_coach should recommend double_number_line for ratios.'
)

const diagnosis = misconceptionDiagnosis({ topic: 'fractions', studentWork: 'I added 1/2 + 1/3 and got 2/5.' })
assert(diagnosis.findings.length > 0, 'misconception_diagnosis should return at least one finding.')

const practiceSet = practiceSetGenerator({ topic: 'geometry', count: 2 })
assert(practiceSet.items.length === 2, 'practice_set_generator should honor requested count.')

const wordPlan = wordProblemPlan({
  problemText: 'A recipe uses 3 cups of flour for 12 muffins. How many cups are needed for 20 muffins?',
  topic: 'ratios',
})
assert(
  wordPlan.recommendedTools.includes('double_number_line') || wordPlan.recommendedTools.includes('ratio_table'),
  'word_problem_plan should recommend a ratio visual for ratio word problems.'
)

const nextMove = socraticMovePlanner({ topic: 'fractions', studentWork: 'I got 2/5 for 1/2 + 1/3.' })
assert(
  nextMove.recommendedTool === 'misconception_diagnosis',
  'socratic_move_planner should recommend misconception_diagnosis when student work is present.'
)

console.log(`Voice agent tool smoke test passed (${smokeCases.length + 6} checks).`)
