import {
  angleDiagramScene,
  adaptiveReviewPlan,
  answerDisclosureGate,
  areaPerimeterModelScene,
  arrayModelScene,
  barModelScene,
  boardAnimationPlan,
  commonDenominator,
  compositeAreaModelScene,
  coordinateDistanceScene,
  curriculumCoach,
  dataDisplayScene,
  decimalCompare,
  decimalGridScene,
  doubleNumberLineScene,
  equationBalanceScene,
  exitTicketBuilder,
  factorTreeScene,
  fractionCompareScene,
  fractionOperationScene,
  fractionSimplify,
  fractionStripScene,
  geometryFigure,
  graphFunction,
  integerChipsScene,
  integerOperationScene,
  hintLadder,
  longDivisionScene,
  mathCheckAnswer,
  mathCheckStep,
  misconceptionDiagnosis,
  mistakePatternClassifier,
  nextStepCoach,
  numberLineScene,
  orderOfOperationsScene,
  placeValueChartScene,
  plotPointsOnPlane,
  practiceSetGenerator,
  problemUnderstandingMap,
  percentBarScene,
  percentOfNumber,
  probabilityModelScene,
  ratioTableScene,
  representationBridge,
  roundNumber,
  sessionMasterySnapshot,
  socraticMovePlanner,
  slopeTriangleScene,
  statisticsSummaryScene,
  studentCheckQuestion,
  tableOfValues,
  tutorTeachingSequence,
  tutorTurnAudit,
  unitRate,
  unitConversionScene,
  wordProblemPlan,
  workedExampleFader,
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
    name: 'integer_operation_scene',
    run: () => integerOperationScene({ left: -3, right: 5, operation: 'add' }),
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
    run: () =>
      placeValueChartScene({
        columns: ['ones', 'tenths', 'hundredths'],
        rows: [{ label: '3.47', values: [3, 4, 7] }],
        highlightColumn: 'hundredths',
      }),
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
    name: 'missing_piece_composite_area_model',
    run: () =>
      compositeAreaModelScene({
        unitLabel: 'cm',
        rectangles: [{ xUnits: 0, yUnits: 0, widthUnits: 10, heightUnits: 8, label: 'Whole' }],
        removedRectangles: [{ xUnits: 7, yUnits: 0, widthUnits: 3, heightUnits: 4, label: 'Missing' }],
      }),
  },
  {
    name: 'triangle_area_model',
    run: () =>
      geometryFigure({
        figureType: 'triangle',
        baseUnits: 10,
        heightUnits: 6,
        unitLabel: 'cm',
        showTriangleAreaModel: true,
      }),
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
    name: 'angle_relationship_diagram',
    run: () =>
      angleDiagramScene({
        degrees: 35,
        relationshipType: 'complementary',
        knownAngle: 35,
        missingAngle: 55,
      }),
  },
  {
    name: 'equation_balance',
    run: () => equationBalanceScene({ leftExpression: 'x+3', rightExpression: '10' }),
  },
]

for (const smokeCase of smokeCases) {
  assertCanvasResult(smokeCase.name, smokeCase.run())
}

const highlightedPlaceValueChart = placeValueChartScene({
  columns: ['ones', 'tenths', 'hundredths'],
  rows: [{ label: '3.47', values: [3, 4, 7] }],
  highlightColumn: 'hundredths',
})
assert(
  highlightedPlaceValueChart.canvasActions.some((action) => action.type === 'highlight_region') &&
    JSON.stringify(highlightedPlaceValueChart).includes('Focus: hundredths place'),
  'place_value_chart should highlight the target place when requested.'
)

const correctAnswer = mathCheckAnswer({ problemExpression: '3/4+2/3', studentAnswer: '17/12' })
assert(correctAnswer.verdict === 'correct', 'math_check_answer should mark 17/12 as correct.')

const invalidFractionStep = mathCheckStep('1/2 + 1/3', '2/5')
assert(
  invalidFractionStep.verdict === 'invalid' &&
    invalidFractionStep.hintTarget.includes('common denominator'),
  'math_check_step should catch invalid fraction expression steps.'
)

const validMixedNumberStep = mathCheckStep('1 1/2 + 2 1/4', '3 3/4')
assert(
  validMixedNumberStep.verdict === 'valid' &&
    validMixedNumberStep.hintTarget.includes('mixed numbers'),
  'math_check_step should validate equivalent mixed-number addition steps.'
)

const invalidMixedNumberStep = mathCheckStep('3 1/2 - 1 1/4', '2 3/4')
assert(
  invalidMixedNumberStep.verdict === 'invalid' &&
    invalidMixedNumberStep.hintTarget.includes('mixed numbers'),
  'math_check_step should catch mixed-number subtraction mistakes.'
)

const validMixedNumberMultiplicationStep = mathCheckStep('1 1/2 * 2 2/3', '4')
assert(
  validMixedNumberMultiplicationStep.verdict === 'valid' &&
    validMixedNumberMultiplicationStep.hintTarget.includes('mixed numbers'),
  'math_check_step should validate mixed-number multiplication steps.'
)

const invalidMixedNumberDivisionStep = mathCheckStep('3 1/2 / 1 3/4', '1 1/2')
assert(
  invalidMixedNumberDivisionStep.verdict === 'invalid' &&
    invalidMixedNumberDivisionStep.hintTarget.includes('mixed numbers'),
  'math_check_step should catch mixed-number division mistakes.'
)

const validDistributiveStep = mathCheckStep('3(x + 4)', '3x + 12')
assert(
  validDistributiveStep.verdict === 'valid' &&
    validDistributiveStep.hintTarget.includes('distributive property'),
  'math_check_step should validate distributive-property steps.'
)

const invalidDistributiveStep = mathCheckStep('3(x + 4)', '3x + 4')
assert(
  invalidDistributiveStep.verdict === 'invalid' &&
    invalidDistributiveStep.hintTarget.includes('distributive property'),
  'math_check_step should catch distributive-property mistakes.'
)

const validLikeTermsStep = mathCheckStep('2x + 3x + 4', '5x + 4')
assert(
  validLikeTermsStep.verdict === 'valid' &&
    validLikeTermsStep.hintTarget.includes('like terms'),
  'math_check_step should validate combining like terms.'
)

const invalidLikeTermsStep = mathCheckStep('2x + 3x + 4', '9x')
assert(
  invalidLikeTermsStep.verdict === 'invalid' &&
    invalidLikeTermsStep.hintTarget.includes('like terms'),
  'math_check_step should catch invalid like-term combinations.'
)

const validArithmeticStep = mathCheckStep('3 + 4 * 2', '11')
assert(validArithmeticStep.verdict === 'valid', 'math_check_step should validate equivalent arithmetic steps.')

const invalidOrderOfOperationsStep = mathCheckStep('3 + 4 * 2', '14')
assert(
  invalidOrderOfOperationsStep.verdict === 'invalid' &&
    invalidOrderOfOperationsStep.hintTarget.includes('multiplication or division'),
  'math_check_step should catch order-of-operations mistakes.'
)

const validPercentStep = mathCheckStep('25% of 80', '20')
assert(validPercentStep.verdict === 'valid', 'math_check_step should validate percent-of wording.')

const validPercentChangeStep = mathCheckStep('from 80 to 100', '25% increase')
assert(
  validPercentChangeStep.verdict === 'valid' &&
    validPercentChangeStep.hintTarget.includes('original amount'),
  'math_check_step should validate percent-change steps.'
)

const invalidPercentChangeStep = mathCheckStep('from 80 to 100', '20% increase')
assert(
  invalidPercentChangeStep.verdict === 'invalid' &&
    invalidPercentChangeStep.hintTarget.includes('percent-change base'),
  'math_check_step should catch percent-change base mistakes.'
)

const validPercentErrorStep = mathCheckStep('actual 50, measured 48', '4% error')
assert(
  validPercentErrorStep.verdict === 'valid' &&
    validPercentErrorStep.hintTarget.includes('percent-error base'),
  'math_check_step should validate percent-error steps.'
)

const invalidPercentErrorStep = mathCheckStep('actual 50, measured 48', '2% error')
assert(
  invalidPercentErrorStep.verdict === 'invalid' &&
    invalidPercentErrorStep.hintTarget.includes('percent-error base'),
  'math_check_step should catch percent-error base mistakes.'
)

const validDecimalRoundingStep = mathCheckStep('round 3.746 to nearest hundredths', '3.75')
assert(
  validDecimalRoundingStep.verdict === 'valid' &&
    validDecimalRoundingStep.hintTarget.includes('next digit'),
  'math_check_step should validate decimal rounding steps.'
)

const invalidDecimalRoundingStep = mathCheckStep('round 3.746 to nearest hundredths', '3.74')
assert(
  invalidDecimalRoundingStep.verdict === 'invalid' &&
    invalidDecimalRoundingStep.hintTarget.includes('target place'),
  'math_check_step should catch decimal rounding mistakes.'
)

const validPlaceValueDigitStep = mathCheckStep('digit in hundredths place of 3.746', '4')
assert(
  validPlaceValueDigitStep.verdict === 'valid' &&
    validPlaceValueDigitStep.hintTarget.includes('hundredths'),
  'math_check_step should validate decimal place-value digit claims.'
)

const invalidPlaceValueDigitStep = mathCheckStep('digit in hundreds place of 4,732', '3')
assert(
  invalidPlaceValueDigitStep.verdict === 'invalid' &&
    invalidPlaceValueDigitStep.hintTarget.includes('hundreds'),
  'math_check_step should catch whole-number place-value digit mistakes.'
)

const invalidPlaceValueValueStep = mathCheckStep('value of 7 in 4,732', '70')
assert(
  invalidPlaceValueValueStep.verdict === 'invalid' &&
    invalidPlaceValueValueStep.hintTarget.includes("digit's place"),
  'math_check_step should catch digit-value mistakes.'
)

const unclearRepeatedDigitValueStep = mathCheckStep('value of 2 in 2,020', '20')
assert(
  unclearRepeatedDigitValueStep.verdict === 'unclear' &&
    unclearRepeatedDigitValueStep.reason.includes('more than one 2') &&
    unclearRepeatedDigitValueStep.hintTarget.includes('naming its place'),
  'math_check_step should ask for clarification when a digit appears more than once.'
)

const invalidDecimalStep = mathCheckStep('0.4 + 0.08', '0.12')
assert(
  invalidDecimalStep.verdict === 'invalid' &&
    invalidDecimalStep.hintTarget.includes('decimal place values'),
  'math_check_step should catch decimal place-value mistakes.'
)

const validRatioStep = mathCheckStep('3:12', '1:4')
assert(validRatioStep.verdict === 'valid', 'math_check_step should validate equivalent ratio simplification.')

const invalidRatioStep = mathCheckStep('3:12', '1:3')
assert(
  invalidRatioStep.verdict === 'invalid' &&
    invalidRatioStep.hintTarget.includes('ratio'),
  'math_check_step should catch ratio simplification mistakes.'
)

const invalidIntegerSignStep = mathCheckStep('-3 - 5', '2')
assert(
  invalidIntegerSignStep.verdict === 'invalid' &&
    invalidIntegerSignStep.hintTarget.includes('integer signs'),
  'math_check_step should catch signed-integer operation mistakes.'
)

const validUnitConversionStep = mathCheckStep('2.5 m', '250 cm')
assert(
  validUnitConversionStep.verdict === 'valid' &&
    validUnitConversionStep.hintTarget.includes('conversion factor'),
  'math_check_step should validate equivalent unit conversion steps.'
)

const invalidUnitConversionStep = mathCheckStep('3 kg', '300 g')
assert(
  invalidUnitConversionStep.verdict === 'invalid' &&
    invalidUnitConversionStep.hintTarget.includes('conversion factor'),
  'math_check_step should catch invalid unit conversion steps.'
)

const validRectangleAreaStep = mathCheckStep('area of rectangle 7 by 4', '28')
assert(
  validRectangleAreaStep.verdict === 'valid' &&
    validRectangleAreaStep.hintTarget.includes('square units'),
  'math_check_step should validate rectangle area claims.'
)

const invalidRectangleAreaStep = mathCheckStep('area of rectangle 7 by 4', '22')
assert(
  invalidRectangleAreaStep.verdict === 'invalid' &&
    invalidRectangleAreaStep.hintTarget.includes('area from perimeter'),
  'math_check_step should catch rectangle area/perimeter mixups.'
)

const validRectanglePerimeterStep = mathCheckStep('perimeter of rectangle 7 by 4', '22')
assert(
  validRectanglePerimeterStep.verdict === 'valid' &&
    validRectanglePerimeterStep.hintTarget.includes('boundary'),
  'math_check_step should validate rectangle perimeter claims.'
)

const validCompositeAreaStep = mathCheckStep('total area of composite rectangles 3 by 4 and 2 by 5', '22')
assert(
  validCompositeAreaStep.verdict === 'valid' &&
    validCompositeAreaStep.hintTarget.includes('decomposed rectangle areas'),
  'math_check_step should validate composite area claims.'
)

const invalidCompositeAreaStep = mathCheckStep('total area of composite rectangles 3 by 4 and 2 by 5', '25')
assert(
  invalidCompositeAreaStep.verdict === 'invalid' &&
    invalidCompositeAreaStep.hintTarget.includes('outside bounding rectangle'),
  'math_check_step should catch composite area bounding-box mistakes.'
)

const validMissingPieceCompositeAreaStep = mathCheckStep('area of composite rectangle 10 by 8 with 3 by 4 missing', '68')
assert(
  validMissingPieceCompositeAreaStep.verdict === 'valid' &&
    validMissingPieceCompositeAreaStep.hintTarget.includes('subtracts the removed rectangle'),
  'math_check_step should validate missing-piece composite area claims.'
)

const invalidMissingPieceCompositeAreaStep = mathCheckStep('area of composite rectangle 10 by 8 with 3 by 4 missing', '92')
assert(
  invalidMissingPieceCompositeAreaStep.verdict === 'invalid' &&
    invalidMissingPieceCompositeAreaStep.hintTarget.includes('instead of adding'),
  'math_check_step should catch missing-piece composite area addition mistakes.'
)

const triangleAreaModel = geometryFigure({
  figureType: 'triangle',
  baseUnits: 10,
  heightUnits: 6,
  unitLabel: 'cm',
  showTriangleAreaModel: true,
})
assert(
  triangleAreaModel.summary.includes('area 30 square cm') &&
    JSON.stringify(triangleAreaModel).includes('Half-rectangle area') &&
    JSON.stringify(triangleAreaModel).includes('base = 10') &&
    JSON.stringify(triangleAreaModel).includes('height = 6'),
  'geometry_figure should draw a triangle area model with base, height, and half-rectangle reasoning.'
)

const validTriangleAreaStep = mathCheckStep('area of triangle with base 10 and height 6', '30')
assert(
  validTriangleAreaStep.verdict === 'valid' &&
    validTriangleAreaStep.hintTarget.includes('half'),
  'math_check_step should validate triangle area claims.'
)

const invalidTriangleAreaStep = mathCheckStep('area of triangle with base 10 and height 6', '60')
assert(
  invalidTriangleAreaStep.verdict === 'invalid' &&
    invalidTriangleAreaStep.hintTarget.includes('halve'),
  'math_check_step should catch triangle area base-times-height mistakes.'
)

const validComplementaryAngleStep = mathCheckStep('complementary angle to 35', '55')
assert(
  validComplementaryAngleStep.verdict === 'valid' &&
    validComplementaryAngleStep.hintTarget.includes('90 degree total'),
  'math_check_step should validate complementary angle claims.'
)

const invalidSupplementaryAngleStep = mathCheckStep('supplementary angle to 110', '80')
assert(
  invalidSupplementaryAngleStep.verdict === 'invalid' &&
    invalidSupplementaryAngleStep.hintTarget.includes('180 degrees'),
  'math_check_step should catch supplementary angle total mistakes.'
)

const invalidTriangleAngleStep = mathCheckStep('missing angle in triangle with angles 50 and 60', '80')
assert(
  invalidTriangleAngleStep.verdict === 'invalid' &&
    invalidTriangleAngleStep.hintTarget.includes('subtract from 180'),
  'math_check_step should catch triangle angle-sum mistakes.'
)

const complementaryAngleDiagram = angleDiagramScene({
  degrees: 35,
  relationshipType: 'complementary',
  knownAngle: 35,
  missingAngle: 55,
})
assert(
  complementaryAngleDiagram.summary.includes('complementary angle relationship') &&
    JSON.stringify(complementaryAngleDiagram).includes('35 degrees + 55 degrees = 90 degrees'),
  'angle_diagram should draw complementary angle relationship notes.'
)

const triangleAngleDiagram = angleDiagramScene({
  degrees: 70,
  relationshipType: 'triangle_sum',
  knownAngle: 50,
  secondKnownAngle: 60,
  missingAngle: 70,
})
assert(
  triangleAngleDiagram.summary.includes('triangle angle-sum') &&
    JSON.stringify(triangleAngleDiagram).includes('50 + 60 + ? = 180'),
  'angle_diagram should draw triangle angle-sum relationship notes.'
)

const validCoordinatePointStep = mathCheckStep('y = 2x + 1', '(2, 5)')
assert(
  validCoordinatePointStep.verdict === 'valid' &&
    validCoordinatePointStep.hintTarget.includes('x-coordinate'),
  'math_check_step should validate a plotted point that fits a function.'
)

const invalidCoordinatePointStep = mathCheckStep('y = 2x + 1', '(2, 4)')
assert(
  invalidCoordinatePointStep.verdict === 'invalid' &&
    invalidCoordinatePointStep.hintTarget.includes('x-coordinate'),
  'math_check_step should catch plotted points that do not fit a function.'
)

const validCoordinateDistanceStep = mathCheckStep('distance from (2, 3) to (5, 7)', '5')
assert(
  validCoordinateDistanceStep.verdict === 'valid' &&
    validCoordinateDistanceStep.hintTarget.includes('coordinate changes'),
  'math_check_step should validate coordinate distance claims.'
)

const invalidCoordinateDistanceStep = mathCheckStep('distance from (2, 3) to (5, 7)', '4')
assert(
  invalidCoordinateDistanceStep.verdict === 'invalid' &&
    invalidCoordinateDistanceStep.hintTarget.includes('horizontal and vertical changes'),
  'math_check_step should catch incorrect coordinate distance claims.'
)

const validSlopeStep = mathCheckStep('slope from (1, 2) to (5, 6)', '1')
assert(
  validSlopeStep.verdict === 'valid' &&
    validSlopeStep.hintTarget.includes('rise over run'),
  'math_check_step should validate slope claims between two points.'
)

const invalidSlopeStep = mathCheckStep('slope from (1, 2) to (5, 6)', '4')
assert(
  invalidSlopeStep.verdict === 'invalid' &&
    invalidSlopeStep.hintTarget.includes('rise over run'),
  'math_check_step should catch slope claims that use only one coordinate change.'
)

const validUndefinedSlopeStep = mathCheckStep('slope from (2, 1) to (2, 5)', 'undefined')
assert(
  validUndefinedSlopeStep.verdict === 'valid' &&
    validUndefinedSlopeStep.reason.includes('undefined'),
  'math_check_step should validate undefined slope for vertical lines.'
)

const validYInterceptStep = mathCheckStep('y-intercept of y = 2x + 4', '(0, 4)')
assert(
  validYInterceptStep.verdict === 'valid' &&
    validYInterceptStep.hintTarget.includes('y-intercept'),
  'math_check_step should validate y-intercept claims.'
)

const invalidXInterceptStep = mathCheckStep('x-intercept of y = 2x + 4', '(4, 0)')
assert(
  invalidXInterceptStep.verdict === 'invalid' &&
    invalidXInterceptStep.hintTarget.includes('x-intercept'),
  'math_check_step should catch x-intercept claims that use the wrong axis condition.'
)

const validValueTableStep = mathCheckStep('table for y = 2x + 1', '(0, 1), (1, 3), (2, 5)')
assert(
  validValueTableStep.verdict === 'valid' &&
    validValueTableStep.hintTarget.includes('x-value'),
  'math_check_step should validate table-of-values rows.'
)

const invalidValueTableStep = mathCheckStep('table for y = 2x + 1', '(0, 1), (1, 3), (2, 4)')
assert(
  invalidValueTableStep.verdict === 'invalid' &&
    invalidValueTableStep.hintTarget.includes('table row'),
  'math_check_step should catch table-of-values row mistakes.'
)

const validMeanStep = mathCheckStep('mean of 4, 7, 3, 7, 9', '6')
assert(
  validMeanStep.verdict === 'valid' &&
    validMeanStep.hintTarget.includes('total shared equally'),
  'math_check_step should validate mean claims.'
)

const invalidMedianStep = mathCheckStep('median of 4, 7, 3, 7, 9', '6')
assert(
  invalidMedianStep.verdict === 'invalid' &&
    invalidMedianStep.hintTarget.includes('middle value'),
  'math_check_step should catch median-ordering mistakes.'
)

const invalidModeStep = mathCheckStep('mode of 4, 7, 3, 7, 9', '4')
assert(
  invalidModeStep.verdict === 'invalid' &&
    invalidModeStep.hintTarget.includes('mode'),
  'math_check_step should catch mode frequency mistakes.'
)

const validRangeStep = mathCheckStep('range of 4, 7, 3, 7, 9', '6')
assert(
  validRangeStep.verdict === 'valid' &&
    validRangeStep.hintTarget.includes('range'),
  'math_check_step should validate range claims.'
)

const validProbabilityStep = mathCheckStep('probability of 3 favorable outcomes out of 8', '3/8')
assert(
  validProbabilityStep.verdict === 'valid' &&
    validProbabilityStep.hintTarget.includes('favorable outcomes over total outcomes'),
  'math_check_step should validate simple probability claims.'
)

const invalidComplementProbabilityStep = mathCheckStep('complement probability of 3 favorable outcomes out of 8', '3/8')
assert(
  invalidComplementProbabilityStep.verdict === 'invalid' &&
    invalidComplementProbabilityStep.hintTarget.includes('complement'),
  'math_check_step should catch probability complement mistakes.'
)

const validNumericEqualityStep = mathCheckStep('3/4 = 6/8', '0.75 = 0.75')
assert(
  validNumericEqualityStep.verdict === 'valid',
  'math_check_step should validate true non-variable equality statements.'
)

const invalidNumericEqualityStep = mathCheckStep('3/4 = 6/8', '3/4 = 7/8')
assert(
  invalidNumericEqualityStep.verdict === 'invalid',
  'math_check_step should reject false non-variable equality statements.'
)

const validLinearStep = mathCheckStep('2x + 3 = 11', '2x = 8')
assert(
  validLinearStep.verdict === 'valid',
  'math_check_step should validate balanced linear equation steps.'
)

const invalidLinearBalanceStep = mathCheckStep('2x + 3 = 11', '2x = 14')
assert(
  invalidLinearBalanceStep.verdict === 'invalid' &&
    invalidLinearBalanceStep.reason.includes('changed differently') &&
    invalidLinearBalanceStep.hintTarget.includes('both sides'),
  'math_check_step should explain two-step equation balance mistakes.'
)

const coach = curriculumCoach({ topic: 'ratios', gradeLevel: 'Grade 6' })
assert(
  (coach.recommendedTools as readonly string[]).includes('double_number_line'),
  'curriculum_coach should recommend double_number_line for ratios.'
)

const diagnosis = misconceptionDiagnosis({ topic: 'fractions', studentWork: 'I added 1/2 + 1/3 and got 2/5.' })
assert(diagnosis.findings.length > 0, 'misconception_diagnosis should return at least one finding.')

const mistakePattern = mistakePatternClassifier({
  topic: 'fractions',
  studentWork: 'I added 1/2 + 1/3 and got 2/5.',
  studentExplanation: 'I added the tops and bottoms.',
  expectedAnswer: '5/6',
})
assert(
  mistakePattern.primaryPattern === 'denominator_operation' &&
    mistakePattern.recommendedTools.includes('fraction_operation'),
  'mistake_pattern_classifier should identify denominator-operation errors.'
)

const ladder = hintLadder({
  topic: 'fractions',
  studentWork: 'I added 1/2 + 1/3 and got 2/5.',
})
assert(
  ladder.levels.length === 3 && ladder.levels.every((level) => level.revealAnswer === false),
  'hint_ladder should create three non-answer-dumping hint levels.'
)

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

const understandingMap = problemUnderstandingMap({
  problemText: 'A recipe uses 3 cups of flour for 12 muffins. How many cups are needed for 20 muffins?',
  gradeLevel: 'Grade 6',
  studentWork: '',
})
assert(
  understandingMap.knownQuantities.length >= 3 &&
    understandingMap.representationCandidates.includes('ratio_table'),
  'problem_understanding_map should extract quantities and representation candidates.'
)

const bridge = representationBridge({
  topic: 'ratios',
  problemContext: '3 notebooks cost 12 dollars',
  fromRepresentation: 'words',
  toRepresentation: 'table',
  studentWork: '',
})
assert(
  bridge.recommendedTool === 'ratio_table' &&
    bridge.bridgeQuestion.includes('row'),
  'representation_bridge should connect word problems to ratio tables.'
)

const fadedExample = workedExampleFader({
  topic: 'fractions',
  gradeLevel: 'Grade 5',
  exampleProblem: 'Add 1/2 + 1/3',
  studentWork: '',
})
assert(
  fadedExample.phases.map((phase) => phase.phase).join(',') === 'i_do,we_do,you_do' &&
    fadedExample.stopRule.includes('Stop fading'),
  'worked_example_fader should create an I-do, we-do, you-do sequence.'
)

const nextMove = socraticMovePlanner({ topic: 'fractions', studentWork: 'I got 2/5 for 1/2 + 1/3.' })
assert(
  nextMove.recommendedTool === 'misconception_diagnosis',
  'socratic_move_planner should recommend misconception_diagnosis when student work is present.'
)

const teachingSequence = tutorTeachingSequence({
  topic: 'fractions',
  gradeLevel: 'Grade 5',
  studentGoal: 'I am stuck adding unlike denominators.',
  studentWork: '1/2 + 1/3 = 2/5',
})
assert(
  teachingSequence.recommendedTool === 'misconception_diagnosis' &&
    teachingSequence.boardPlan.length >= 3,
  'tutor_teaching_sequence should plan a diagnostic tutor turn with board stages.'
)

const coachedMove = nextStepCoach({
  topic: 'fractions',
  gradeLevel: 'Grade 5',
  studentWork: '1/2 + 1/3 = 2/5',
  goal: 'I am stuck and need a hint.',
})
assert(
  coachedMove.situation === 'student_stuck' &&
    coachedMove.recommendedTool === 'hint_ladder' &&
    coachedMove.askNext.length > 0,
  'next_step_coach should turn stuck student work into one non-answer-dumping tutor move.'
)

const checkQuestion = studentCheckQuestion({
  topic: 'fractions',
  gradeLevel: 'Grade 5',
  studentWork: '1/2 + 1/3 = 2/5',
  recentToolName: 'fraction_operation',
  recentToolResult: 'A common denominator is needed.',
  checkType: 'error_spotting',
})
assert(
  checkQuestion.checkType === 'error_spotting' &&
    checkQuestion.question.includes('pieces') &&
    checkQuestion.expectedEvidence.length >= 3,
  'student_check_question should create one targeted comprehension check from current work.'
)

const exitTicket = exitTicketBuilder({
  topic: 'ratios',
  gradeLevel: 'Grade 6',
  sessionGoal: 'wrap up unit rate practice',
  studentEvidence: 'Student found 12 dollars for 3 notebooks means 4 dollars per notebook.',
  difficulty: 'core',
  count: 2,
})
assert(
  exitTicket.items.length === 2 &&
    exitTicket.items.every((item) => item.expectedEvidence.length >= 3) &&
    exitTicket.privacyNote.includes('personal details'),
  'exit_ticket_builder should create short review items with evidence and privacy guidance.'
)

const reviewPlan = adaptiveReviewPlan({
  gradeLevel: 'Grade 5',
  targetTopic: 'fractions',
  sessionGoal: 'continue from last time',
  topics: ['fractions'],
  struggleSignals: ['student says they are stuck'],
  recentExcerpts: ['I got stuck adding unlike denominators.'],
})
assert(
  reviewPlan.reviewMode === 'rebuild' &&
    reviewPlan.firstBoardTool === 'fraction_strip' &&
    reviewPlan.microPractice.length === 2,
  'adaptive_review_plan should turn learner history into a concrete review path.'
)

const masterySnapshot = sessionMasterySnapshot({
  topic: 'ratios',
  gradeLevel: 'Grade 6',
  transcriptExcerpt: 'I know this is a unit rate because it tells us the value for one notebook.',
  studentWork: '3 notebooks cost $12, so 1 notebook costs $4.',
  toolSummary: 'unit_rate returned 4 dollars per notebook.',
})
assert(
  masterySnapshot.confidence === 'high' &&
    masterySnapshot.nextPractice.length === 2 &&
    masterySnapshot.privacyNote.includes('personal details'),
  'session_mastery_snapshot should produce a teacher-safe learning handoff.'
)

const turnAudit = tutorTurnAudit({
  studentPrompt: 'Can you help with 1/2 + 1/3?',
  assistantDraft: 'The final answer is 5/6.',
  topic: 'fractions',
  toolUsed: 'fraction_operation',
})
assert(
  turnAudit.approved === false &&
    turnAudit.issues.includes('answer_dumping') &&
    turnAudit.allowedNextAction !== 'say_as_written',
  'tutor_turn_audit should flag answer dumping before the tutor speaks.'
)

const answerGate = answerDisclosureGate({
  studentRequest: 'Just tell me the answer.',
  hasStudentAttempt: false,
  attemptCount: 0,
  isCheckingAnswer: false,
  askedForFullSolution: true,
})
assert(
  answerGate.decision === 'hint_only' && answerGate.requiredPause === true,
  'answer_disclosure_gate should preserve student thinking before any attempt.'
)

const animationPlan = boardAnimationPlan({
  concept: 'Explain equivalent fractions with a staged bar model',
  visualType: 'part-whole visual reveal',
  gradeLevel: 'Grade 4',
  wantsOfflineVideo: false,
})
assertCanvasResult('board_animation_plan', animationPlan)
assert(
  animationPlan.renderer === 'tldraw_step_reveal' && animationPlan.stages.length === 4,
  'board_animation_plan should default to a live tldraw step reveal.'
)

const simplifiedFraction = fractionSimplify({ numerator: 18, denominator: 24 })
assert(simplifiedFraction.simplified === '3/4', 'fraction_simplify should reduce 18/24 to 3/4.')

const percentResult = percentOfNumber({ percent: 30, whole: 60 })
assert(percentResult.part === 18, 'percent_of_number should compute 30% of 60 as 18.')

const rate = unitRate({ quantity: 3, value: 12, quantityLabel: 'notebook', valueLabel: 'dollars' })
assert(rate.ratePerOne === 4, 'unit_rate should compute 12 dollars for 3 notebooks as 4 per notebook.')

const decimalComparison = decimalCompare({ left: 0.8, right: 0.75 })
assert(decimalComparison.comparison === 'left_greater', 'decimal_compare should know 0.8 > 0.75.')

const rounded = roundNumber({ value: 8649, place: 'hundreds' })
assert(rounded.rounded === 8600, 'round_number should round 8649 to 8600 by hundreds.')

const denominatorPlan = commonDenominator({
  leftNumerator: 1,
  leftDenominator: 2,
  rightNumerator: 1,
  rightDenominator: 3,
})
assert(
  denominatorPlan.leftEquivalent === '3/6' && denominatorPlan.rightEquivalent === '2/6',
  'common_denominator should convert 1/2 and 1/3 to sixths.'
)

console.log(`Voice agent tool smoke test passed (${smokeCases.length + 23} checks).`)
