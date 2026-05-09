import assert from 'node:assert/strict'
import {
  buildLocalAssistantReply,
  hydrateLocalToolPlanInput,
  planLocalToolTurn,
} from '@/lib/livekit/local-tool-planner'
import {
  serializeTutorBoardState,
  type BoardStateReader,
} from '@/lib/tutor/board-state-serialization'
import {
  buildSilentTutorBoardContext,
  extractTutorVisibleMessageText,
  isSilentTutorBoardContextText,
  stripSilentTutorBoardContextParts,
} from '@/lib/tutor/silent-board-context'

type PlannerCase = {
  name: string
  prompt: string
  expectedTools: string[]
  inspect?: (firstInput: Record<string, unknown>, plans: ReturnType<typeof planLocalToolTurn>) => void
}

const mockBoardShapes = {
  'base-label': {
    type: 'text',
    props: {
      richText: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Base 8 cm' }] }],
      },
    },
    meta: { lemmaToolOwned: true, lemmaArtifactGroupId: 'tool:geometry_figure' },
  },
  'height-label': {
    type: 'text',
    props: {
      richText: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Height 5 cm' }] }],
      },
    },
    meta: { lemmaToolOwned: true, lemmaArtifactGroupId: 'tool:geometry_figure' },
  },
  'student-note': {
    type: 'math-block',
    props: { latex: 'A=\\frac{1}{2}bh' },
    meta: {},
  },
} satisfies Record<string, { type: string; props: Record<string, unknown>; meta: Record<string, unknown> }>

const mockBoardReader: BoardStateReader<keyof typeof mockBoardShapes> = {
  getCurrentPageShapeIds: () => Object.keys(mockBoardShapes) as Array<keyof typeof mockBoardShapes>,
  getShape: (shapeId) => mockBoardShapes[shapeId],
  getShapePageBounds: (shapeId) => {
    if (shapeId === 'base-label') return { x: 100, y: 240, w: 110, h: 30 }
    if (shapeId === 'height-label') return { x: 210, y: 130, w: 120, h: 30 }
    return { x: 140, y: 285, w: 180, h: 60 }
  },
}

const cases: PlannerCase[] = [
  {
    name: 'routes answer requests through disclosure gate before solving',
    prompt: 'Just tell me the answer to 7 times 8.',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'routes direct equation solving through disclosure gate before an attempt',
    prompt: 'Can you solve 2x + 3 = 11 for me?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'routes topic-specific final-answer requests through disclosure gate',
    prompt: 'What is the final answer for 25% of 80?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'gates direct percent final-answer questions before tools',
    prompt: 'What is 25% of 80?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'gates direct fraction final-answer questions before tools',
    prompt: 'What is 1/2 + 1/3?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'gates direct area final-answer questions before board tools',
    prompt: 'What is the final answer for the area of a 4 by 5 rectangle?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'gates direct probability final-answer questions before board tools',
    prompt: 'What is the probability of 3 favorable outcomes out of 8?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'gates direct data statistic final-answer questions before board tools',
    prompt: 'What is the mean of 4, 7, 3, 7, and 9?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'gates direct unit-rate final-answer questions before board tools',
    prompt: 'A store sells 3 notebooks for $6. What is the unit rate?',
    expectedTools: ['answer_disclosure_gate'],
    inspect: (input) => {
      assert.equal(input.hasStudentAttempt, false)
      assert.equal(input.askedForFullSolution, true)
    },
  },
  {
    name: 'keeps disclosure gate first after a student attempt asks for a full solve',
    prompt: 'I tried 2x + 3 = 11 and got x = 4. Can you solve 2x + 3 = 11 fully?',
    expectedTools: ['answer_disclosure_gate', 'solve_linear_on_canvas'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.equal(plans[1].input.problem, '2x + 3 = 11')
    },
  },
  {
    name: 'keeps disclosure gate first then continues after a percent attempt',
    prompt: 'I got 20 for 25% of 80. What is 25% of 80?',
    expectedTools: ['answer_disclosure_gate', 'percent_of_number', 'percent_bar'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.equal(plans[1].input.percent, 25)
      assert.equal(plans[1].input.whole, 80)
    },
  },
  {
    name: 'continues after a mean attempt with only the original data values',
    prompt: 'I got 5. What is the mean of 4, 7, 3, 7, and 9?',
    expectedTools: ['answer_disclosure_gate', 'statistics_summary'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.deepEqual(plans[1].input.values, [4, 7, 3, 7, 9])
    },
  },
  {
    name: 'continues after a trailing data attempt with the original data set',
    prompt: 'The data set is 4, 7, 3, 7, and 9. What is the mean? I got 5.',
    expectedTools: ['answer_disclosure_gate', 'statistics_summary'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.deepEqual(plans[1].input.values, [4, 7, 3, 7, 9])
    },
  },
  {
    name: 'continues after a unit-rate attempt with the original rate pair',
    prompt: 'I got $2 per notebook. What is the unit rate for 3 notebooks costing $6?',
    expectedTools: ['answer_disclosure_gate', 'unit_rate', 'double_number_line'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.equal(plans[1].input.quantity, 3)
      assert.equal(plans[1].input.value, 6)
      assert.equal(plans[1].input.quantityLabel, 'notebooks')
      assert.equal(plans[1].input.valueLabel, 'dollars')
      assert.deepEqual(plans[2].input.pairs, [
        { top: 0, bottom: 0, label: 'start' },
        { top: 3, bottom: 6, label: 'given' },
      ])
    },
  },
  {
    name: 'continues after a recipe ratio attempt with the target quantity',
    prompt: 'I got 4 cups. For the recipe, 3 cups make 12 muffins. How many cups for 20 muffins?',
    expectedTools: ['answer_disclosure_gate', 'double_number_line'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.equal(plans[1].input.topLabel, 'muffins')
      assert.equal(plans[1].input.bottomLabel, 'cups')
      assert.deepEqual(plans[1].input.pairs, [
        { top: 0, bottom: 0, label: 'start' },
        { top: 12, bottom: 3, label: 'given' },
        { top: 20, bottom: 5, label: 'target' },
      ])
    },
  },
  {
    name: 'continues after a speed unit-rate attempt with the original distance and time',
    prompt: 'I got 30 miles per hour. What is the unit rate for 150 miles in 3 hours?',
    expectedTools: ['answer_disclosure_gate', 'unit_rate', 'double_number_line'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.equal(plans[1].input.quantity, 3)
      assert.equal(plans[1].input.value, 150)
      assert.equal(plans[1].input.quantityLabel, 'hours')
      assert.equal(plans[1].input.valueLabel, 'miles')
      assert.deepEqual(plans[2].input.pairs, [
        { top: 0, bottom: 0, label: 'start' },
        { top: 3, bottom: 150, label: 'given' },
      ])
    },
  },
  {
    name: 'routes explicit next-move planning to tutor response planner',
    prompt: 'I got 1/2 + 1/3 = 2/5. What should we do next?',
    expectedTools: ['tutor_response_planner'],
    inspect: (input) => {
      assert.equal(input.topic, 'fractions')
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.attemptCount, 1)
    },
  },
  {
    name: 'routes visible diagram references through board-state summary before drawing',
    prompt: 'On the board I drew a triangle with base 8 cm and height 5 cm. How do I find the area from this diagram?',
    expectedTools: ['board_state_summarizer', 'geometry_figure'],
    inspect: (input, plans) => {
      assert.match(String(input.boardDescription), /triangle/)
      assert.equal(plans[1].input.figureType, 'triangle')
      assert.equal(plans[1].input.showTriangleAreaModel, true)
    },
  },
  {
    name: 'routes linear graphs to graph_function with parsed expression and domain',
    prompt: 'Can you graph y = 2x + 1 from x = -3 to 3?',
    expectedTools: ['graph_function'],
    inspect: (input) => {
      assert.equal(input.expression, '2x + 1')
      assert.equal(input.domainStart, -3)
      assert.equal(input.domainEnd, 3)
    },
  },
  {
    name: 'routes value-table requests to table_of_values with parsed x-values',
    prompt: 'Make a table for y = 2x + 1 using x = 0, 1, 2.',
    expectedTools: ['table_of_values'],
    inspect: (input) => {
      assert.equal(input.expression, '2x + 1')
      assert.deepEqual(input.xValues, [0, 1, 2])
    },
  },
  {
    name: 'routes statistics requests to a data summary board model',
    prompt: 'Show the mean, median, mode, and range for 4, 7, 3, 7, 9.',
    expectedTools: ['statistics_summary'],
    inspect: (input) => {
      assert.deepEqual(input.values, [4, 7, 3, 7, 9])
      assert.equal(input.title, 'Statistics summary')
    },
  },
  {
    name: 'routes probability requests to a probability board model',
    prompt: 'Show the probability of 3 favorable outcomes out of 8.',
    expectedTools: ['probability_model'],
    inspect: (input) => {
      assert.equal(input.favorableOutcomes, 3)
      assert.equal(input.totalOutcomes, 8)
      assert.equal(input.title, 'Probability model')
    },
  },
  {
    name: 'routes staged explanation to animation and sequence planning',
    prompt: 'Write while explaining how to simplify fractions step by step',
    expectedTools: ['board_animation_plan', 'tutor_teaching_sequence'],
    inspect: (input) => {
      assert.equal(input.visualType, 'part-whole visual reveal')
      assert.equal(input.wantsOfflineVideo, false)
    },
  },
  {
    name: 'routes fraction comparison to visual fraction compare',
    prompt: 'Compare 2/3 and 3/5 without just giving me the answer',
    expectedTools: ['fraction_compare'],
    inspect: (input) => {
      assert.equal(input.leftNumerator, 2)
      assert.equal(input.rightDenominator, 5)
    },
  },
  {
    name: 'routes explicit fraction-bar requests to fraction strip',
    prompt: 'Show a fraction bar for 5/4.',
    expectedTools: ['fraction_strip'],
    inspect: (input) => {
      assert.equal(input.numerator, 5)
      assert.equal(input.denominator, 4)
      assert.equal(input.title, 'Fraction bar')
    },
  },
  {
    name: 'routes mixed-number fraction-bar requests to an improper fraction strip',
    prompt: 'Show a fraction bar for 1 1/2.',
    expectedTools: ['fraction_strip'],
    inspect: (input) => {
      assert.equal(input.numerator, 3)
      assert.equal(input.denominator, 2)
      assert.equal(input.title, 'Mixed-number fraction bar')
      assert.equal(input.label, '1 1/2 = 3/2')
    },
  },
  {
    name: 'routes equivalent-fraction visual requests to side-by-side bars',
    prompt: 'Show equivalent fraction bars for 1 1/2 and 3/2.',
    expectedTools: ['fraction_compare'],
    inspect: (input) => {
      assert.equal(input.leftNumerator, 3)
      assert.equal(input.leftDenominator, 2)
      assert.equal(input.rightNumerator, 3)
      assert.equal(input.rightDenominator, 2)
      assert.equal(input.title, 'Equivalent fraction bars')
    },
  },
  {
    name: 'routes explicit tape-diagram requests to bar model',
    prompt: 'Draw a tape diagram for 36 stickers total with 14 used and the rest unknown.',
    expectedTools: ['bar_model'],
    inspect: (input) => {
      const bars = input.bars as Array<{
        label: string
        segments: Array<{ label: string; value: number | string; shaded: boolean }>
      }>
      assert.equal(input.title, 'Tape diagram')
      assert.equal(bars[0].label, 'Whole 36')
      assert.equal(bars[0].segments[0].value, 14)
      assert.equal(bars[0].segments[0].shaded, true)
      assert.equal(bars[0].segments[1].value, 22)
      assert.equal(bars[0].segments[1].shaded, false)
    },
  },
  {
    name: 'infers tape diagrams for subtraction part-whole stories',
    prompt: 'Maya has 36 stickers. She used 14. How many stickers are left?',
    expectedTools: ['bar_model'],
    inspect: (input) => {
      const bars = input.bars as Array<{
        label: string
        segments: Array<{ label: string; value: number | string; shaded: boolean }>
      }>
      assert.equal(input.title, 'Part-whole tape diagram')
      assert.equal(bars[0].label, 'Whole 36')
      assert.equal(bars[0].segments[0].value, 14)
      assert.equal(bars[0].segments[1].value, 22)
    },
  },
  {
    name: 'infers tape diagrams for missing-category stories',
    prompt: 'There are 36 students in class. 14 are girls. How many are boys?',
    expectedTools: ['bar_model'],
    inspect: (input) => {
      const bars = input.bars as Array<{
        label: string
        segments: Array<{ label: string; value: number | string; shaded: boolean }>
      }>
      assert.equal(input.title, 'Part-whole tape diagram')
      assert.equal(bars[0].segments[0].value, 14)
      assert.equal(bars[0].segments[1].value, 22)
    },
  },
  {
    name: 'infers comparison tape diagrams for how-many-more stories',
    prompt: 'Maya read 42 pages. Noah read 27 pages. How many more pages did Maya read than Noah?',
    expectedTools: ['bar_model'],
    inspect: (input) => {
      const bars = input.bars as Array<{
        label: string
        segments: Array<{ label: string; value: number | string; shaded: boolean }>
      }>
      assert.equal(input.title, 'Comparison tape diagram')
      assert.equal(bars.length, 2)
      assert.equal(bars[0].label, 'Maya 42 pages')
      assert.equal(bars[0].segments[0].value, 27)
      assert.equal(bars[0].segments[1].value, 15)
      assert.equal(bars[1].label, 'Noah 27 pages')
      assert.equal(bars[1].segments[1].label, 'Gap 15')
    },
  },
  {
    name: 'infers difference-known comparison tapes for fewer-than stories',
    prompt: 'Noah has 18 fewer stickers than Maya, who has 50 stickers. How many stickers does Noah have?',
    expectedTools: ['bar_model'],
    inspect: (input) => {
      const bars = input.bars as Array<{
        label: string
        segments: Array<{ label: string; value: number | string; shaded: boolean }>
      }>
      assert.equal(input.title, 'Difference-known comparison tape diagram')
      assert.equal(bars[0].label, 'Maya 50 stickers')
      assert.equal(bars[0].segments[0].value, 32)
      assert.equal(bars[0].segments[1].value, 18)
      assert.equal(bars[1].label, 'Noah 32 stickers')
      assert.equal(bars[1].segments[1].label, 'Gap 18')
    },
  },
  {
    name: 'infers difference-known comparison tapes for more-than stories',
    prompt: 'Noah has 50 cards. Maya has 18 more cards than Noah. How many cards does Maya have?',
    expectedTools: ['bar_model'],
    inspect: (input) => {
      const bars = input.bars as Array<{
        label: string
        segments: Array<{ label: string; value: number | string; shaded: boolean }>
      }>
      assert.equal(input.title, 'Difference-known comparison tape diagram')
      assert.equal(bars[0].label, 'Maya 68 cards')
      assert.equal(bars[0].segments[0].value, 50)
      assert.equal(bars[0].segments[1].value, 18)
      assert.equal(bars[1].label, 'Noah 50 cards')
      assert.equal(bars[1].segments[1].label, 'Gap 18')
    },
  },
  {
    name: 'routes percent-of-number to calculator plus visual bar',
    prompt: 'What is 25% of 80? Show me the thinking.',
    expectedTools: ['percent_of_number', 'percent_bar'],
    inspect: (input) => {
      assert.equal(input.percent, 25)
      assert.equal(input.whole, 80)
    },
  },
  {
    name: 'routes decimal rounding requests to the rounding tool',
    prompt: 'Round 3.746 to the nearest hundredth.',
    expectedTools: ['round_number'],
    inspect: (input) => {
      assert.equal(input.value, 3.746)
      assert.equal(input.place, 'hundredths')
    },
  },
  {
    name: 'routes measurement conversions to unit conversion board setup',
    prompt: 'Convert 2.5 meters to centimeters.',
    expectedTools: ['unit_conversion'],
    inspect: (input) => {
      assert.equal(input.value, 2.5)
      assert.equal(input.fromUnit, 'm')
      assert.equal(input.toUnit, 'cm')
      assert.equal(input.measurementType, 'length')
    },
  },
  {
    name: 'routes signed integer operations to integer operation scene',
    prompt: 'Can you show -3 + 5 on a number line?',
    expectedTools: ['integer_operation_scene'],
    inspect: (input) => {
      assert.equal(input.left, -3)
      assert.equal(input.right, 5)
      assert.equal(input.operation, 'add')
    },
  },
  {
    name: 'checks explicit wrong fraction step before classifying the mistake',
    prompt: 'I got 1/2 + 1/3 = 2/5. Why is this wrong?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '1/2 + 1/3')
      assert.equal(input.nextStep, '2/5')
    },
  },
  {
    name: 'checks natural mixed-number addition before classifying the mistake',
    prompt: 'I added 1 1/2 and 2 1/4 and got 3 2/4. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '1 1/2 + 2 1/4')
      assert.equal(input.nextStep, '3 2/4')
    },
  },
  {
    name: 'checks natural mixed-number subtraction before classifying the mistake',
    prompt: 'I subtracted 1 1/4 from 3 1/2 and got 2 3/4. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '3 1/2 - 1 1/4')
      assert.equal(input.nextStep, '2 3/4')
    },
  },
  {
    name: 'checks natural mixed-number multiplication before classifying the mistake',
    prompt: 'I multiplied 1 1/2 by 2 2/3 and got 3 1/2. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '1 1/2 * 2 2/3')
      assert.equal(input.nextStep, '3 1/2')
    },
  },
  {
    name: 'checks natural mixed-number division before classifying the mistake',
    prompt: 'I divided 3 1/2 by 1 3/4 and got 1 1/2. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '3 1/2 / 1 3/4')
      assert.equal(input.nextStep, '1 1/2')
    },
  },
  {
    name: 'checks explicit algebra rewrite before classifying the step',
    prompt: 'I changed 2x + 3 = 11 to 2x = 8. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '2x + 3 = 11')
      assert.equal(input.nextStep, '2x = 8')
    },
  },
  {
    name: 'checks distributive-property attempts before classifying the mistake',
    prompt: 'I distributed 3(x + 4) and got 3x + 4. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '3(x + 4)')
      assert.equal(input.nextStep, '3x + 4')
    },
  },
  {
    name: 'checks like-term attempts before classifying the mistake',
    prompt: 'I combined like terms in 2x + 3x + 4 and got 9x. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '2x + 3x + 4')
      assert.equal(input.nextStep, '9x')
    },
  },
  {
    name: 'checks natural order-of-operations attempts before classifying the mistake',
    prompt: 'I calculated 3 + 4 * 2 and got 14. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '3 + 4 * 2')
      assert.equal(input.nextStep, '14')
    },
  },
  {
    name: 'checks percent-change attempts before classifying the mistake',
    prompt: 'The price went from 80 to 100, and I got 20% increase. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'from 80 to 100')
      assert.equal(input.nextStep, '20% increase')
    },
  },
  {
    name: 'checks percent-error attempts before classifying the mistake',
    prompt: 'The actual value was 50 and my estimate was 48, and I got 2% error. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'actual 50, measured 48')
      assert.equal(input.nextStep, '2% error')
    },
  },
  {
    name: 'checks decimal rounding attempts before classifying the mistake',
    prompt: 'I rounded 3.746 to the nearest hundredth and got 3.74. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'round 3.746 to nearest hundredths')
      assert.equal(input.nextStep, '3.74')
    },
  },
  {
    name: 'checks decimal place-value digit attempts before classifying the mistake',
    prompt: 'I think the digit in the hundredths place of 3.746 is 7. Is that right?',
    expectedTools: ['math_check_step', 'place_value_chart', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'digit in hundredths place of 3.746')
      assert.equal(input.nextStep, '7')
      assert.equal(plans[1].input.highlightColumn, 'hundredths')
      assert.deepEqual(plans[1].input.columns, ['ones', 'tenths', 'hundredths', 'thousandths'])
      assert.deepEqual(plans[1].input.rows, [{ label: '3.746', values: ['3', '7', '4', '6'] }])
    },
  },
  {
    name: 'checks whole-number digit-value attempts before classifying the mistake',
    prompt: 'I think the value of the 7 in 4,732 is 70. Is that right?',
    expectedTools: ['math_check_step', 'place_value_chart', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'value of 7 in 4,732')
      assert.equal(input.nextStep, '70')
      assert.equal(plans[1].input.highlightColumn, 'hundreds')
      assert.deepEqual(plans[1].input.columns, ['thousands', 'hundreds', 'tens', 'ones'])
      assert.deepEqual(plans[1].input.rows, [{ label: '4,732', values: ['4', '7', '3', '2'] }])
    },
  },
  {
    name: 'clarifies repeated digit-value attempts without drawing a misleading chart',
    prompt: 'I think the value of the 2 in 2,020 is 20. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'value of 2 in 2,020')
      assert.equal(input.nextStep, '20')
    },
  },
  {
    name: 'checks natural two-step equation balance attempts before classifying the mistake',
    prompt: 'I subtracted 3 from 2x + 3 = 11 and got 2x = 14. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '2x + 3 = 11')
      assert.equal(input.nextStep, '2x = 14')
    },
  },
  {
    name: 'checks decimal answer claims before correcting place-value mistakes',
    prompt: 'Check this: 0.4 + 0.08 = 0.12',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '0.4 + 0.08')
      assert.equal(input.nextStep, '0.12')
    },
  },
  {
    name: 'checks explicit unit conversion step before classifying the mistake',
    prompt: 'I changed 2.5 m to 25 cm. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '2.5 m')
      assert.equal(input.nextStep, '25 cm')
    },
  },
  {
    name: 'checks plotted coordinate point before classifying the graphing mistake',
    prompt: 'Check this: for y = 2x + 1, I plotted (2, 4). Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'y = 2x + 1')
      assert.equal(input.nextStep, '(2, 4)')
    },
  },
  {
    name: 'checks coordinate distance claims before classifying the mistake',
    prompt: 'I found the distance from (2, 3) to (5, 7) is 4. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'distance from (2, 3) to (5, 7)')
      assert.equal(input.nextStep, '4')
    },
  },
  {
    name: 'checks slope claims before classifying the mistake',
    prompt: 'I found the slope from (1, 2) to (5, 6) is 4. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'slope from (1, 2) to (5, 6)')
      assert.equal(input.nextStep, '4')
    },
  },
  {
    name: 'checks undefined slope claims before classifying the mistake',
    prompt: 'I found the slope from (2, 1) to (2, 5) is undefined. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'slope from (2, 1) to (2, 5)')
      assert.equal(input.nextStep, 'undefined')
    },
  },
  {
    name: 'checks graph intercept claims before classifying the mistake',
    prompt: 'The x-intercept of y = 2x + 4 is (4, 0). Is that right?',
    expectedTools: ['math_check_step', 'graph_function', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'x-intercept of y = 2x + 4')
      assert.equal(input.nextStep, '(4, 0)')
      assert.equal(plans[1].toolName, 'graph_function')
      assert.equal(plans[1].input.expression, '2x + 4')
      assert.equal(plans[1].input.showXIntercepts, true)
      assert.equal(plans[1].input.showYIntercept, false)
    },
  },
  {
    name: 'checks table-of-values rows before classifying the mistake',
    prompt: 'For y = 2x + 1, my table is (0, 1), (1, 3), (2, 4). Is that right?',
    expectedTools: ['math_check_step', 'table_of_values', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'table for y = 2x + 1')
      assert.equal(input.nextStep, '(0, 1), (1, 3), (2, 4)')
      assert.equal(plans[1].toolName, 'table_of_values')
      assert.equal(plans[1].input.expression, '2x + 1')
      assert.deepEqual(plans[1].input.xValues, [0, 1, 2])
    },
  },
  {
    name: 'checks statistics claims before classifying the mistake',
    prompt: 'The mean of 4, 7, 3, 7, 9 is 5. Is that right?',
    expectedTools: ['math_check_step', 'statistics_summary', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'mean of 4, 7, 3, 7, 9')
      assert.equal(input.nextStep, '5')
      assert.equal(plans[1].toolName, 'statistics_summary')
      assert.deepEqual(plans[1].input.values, [4, 7, 3, 7, 9])
    },
  },
  {
    name: 'checks trailing data attempts before classifying the mistake',
    prompt: 'The data set is 4, 7, 3, 7, and 9. What is the mean? I got 5. Is that right?',
    expectedTools: ['answer_disclosure_gate', 'math_check_step', 'statistics_summary', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.hasStudentAttempt, true)
      assert.equal(input.askedForFullSolution, true)
      assert.equal(plans[1].input.previousStep, 'mean of 4, 7, 3, 7, 9')
      assert.equal(plans[1].input.nextStep, '5')
      assert.deepEqual(plans[2].input.values, [4, 7, 3, 7, 9])
    },
  },
  {
    name: 'checks probability claims before classifying the mistake',
    prompt: 'The probability of 3 favorable outcomes out of 8 is 3/5. Is that right?',
    expectedTools: ['math_check_step', 'probability_model', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'probability of 3 favorable outcomes out of 8')
      assert.equal(input.nextStep, '3/5')
      assert.equal(plans[1].toolName, 'probability_model')
      assert.equal(plans[1].input.favorableOutcomes, 3)
      assert.equal(plans[1].input.totalOutcomes, 8)
    },
  },
  {
    name: 'checks rectangle area attempts before classifying the mistake',
    prompt: 'I got the area of a 7 by 4 rectangle as 22. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'area of rectangle 7 by 4')
      assert.equal(input.nextStep, '22')
    },
  },
  {
    name: 'checks rectangle perimeter attempts before classifying the mistake',
    prompt: 'I got the perimeter of a 7 by 4 rectangle as 28. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'perimeter of rectangle 7 by 4')
      assert.equal(input.nextStep, '28')
    },
  },
  {
    name: 'checks composite area attempts before classifying the mistake',
    prompt: 'I got the area of a shape made of 3 by 4 and 2 by 5 rectangles as 25. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, 'total area of composite rectangles 3 by 4 and 2 by 5')
      assert.equal(input.nextStep, '25')
    },
  },
  {
    name: 'checks missing-piece composite area attempts before classifying the mistake',
    prompt: 'I got the area of a 10 by 8 rectangle with a 3 by 4 notch cut out as 92. Is that right?',
    expectedTools: ['math_check_step', 'composite_area_model', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'area of composite rectangle 10 by 8 with 3 by 4 missing')
      assert.equal(input.nextStep, '92')
      const boardInput = plans[1].input
      const removedRectangles = boardInput.removedRectangles as Array<{ widthUnits: number; heightUnits: number }>
      assert.equal(removedRectangles.length, 1)
      assert.equal(removedRectangles[0].widthUnits, 3)
      assert.equal(removedRectangles[0].heightUnits, 4)
    },
  },
  {
    name: 'checks triangle area attempts before classifying the mistake',
    prompt: 'I got the area of a triangle with base 10 and height 6 as 60. Is that right?',
    expectedTools: ['math_check_step', 'geometry_figure', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'area of triangle with base 10 and height 6')
      assert.equal(input.nextStep, '60')
      assert.equal(plans[1].input.figureType, 'triangle')
      assert.equal(plans[1].input.baseUnits, 10)
      assert.equal(plans[1].input.heightUnits, 6)
      assert.equal(plans[1].input.showTriangleAreaModel, true)
    },
  },
  {
    name: 'checks supplementary angle attempts before classifying the mistake',
    prompt: 'I think the supplementary angle to 110 is 80. Is that right?',
    expectedTools: ['math_check_step', 'angle_diagram', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'supplementary angle to 110')
      assert.equal(input.nextStep, '80')
      assert.equal(plans[1].input.relationshipType, 'supplementary')
      assert.equal(plans[1].input.knownAngle, 110)
      assert.equal(plans[1].input.missingAngle, 70)
      assert.equal(plans[1].input.attemptedAngle, 80)
    },
  },
  {
    name: 'checks triangle angle-sum attempts before classifying the mistake',
    prompt: 'I got the missing angle in a triangle with angles 50 and 60 as 80. Is that right?',
    expectedTools: ['math_check_step', 'angle_diagram', 'mistake_pattern_classifier'],
    inspect: (input, plans) => {
      assert.equal(input.previousStep, 'missing angle in triangle with angles 50 and 60')
      assert.equal(input.nextStep, '80')
      assert.equal(plans[1].input.relationshipType, 'triangle_sum')
      assert.equal(plans[1].input.knownAngle, 50)
      assert.equal(plans[1].input.secondKnownAngle, 60)
      assert.equal(plans[1].input.missingAngle, 70)
      assert.equal(plans[1].input.attemptedAngle, 80)
    },
  },
  {
    name: 'routes complementary angle requests to an angle diagram',
    prompt: 'Show the complementary angle to 35 on the board.',
    expectedTools: ['angle_diagram'],
    inspect: (input) => {
      assert.equal(input.relationshipType, 'complementary')
      assert.equal(input.knownAngle, 35)
      assert.equal(input.missingAngle, 55)
    },
  },
  {
    name: 'routes triangle area requests to a half-rectangle model',
    prompt: 'Find the area of a triangle with base 10 and height 6.',
    expectedTools: ['geometry_figure'],
    inspect: (input) => {
      assert.equal(input.figureType, 'triangle')
      assert.equal(input.baseUnits, 10)
      assert.equal(input.heightUnits, 6)
      assert.equal(input.showTriangleAreaModel, true)
    },
  },
  {
    name: 'routes composite area requests to a composite area model',
    prompt: 'A shape is made of 3 by 4 and 2 by 5 rectangles. What is the total area?',
    expectedTools: ['composite_area_model'],
    inspect: (input) => {
      const rectangles = input.rectangles as Array<{ widthUnits: number; heightUnits: number; xUnits: number }>
      assert.equal(rectangles.length, 2)
      assert.equal(rectangles[0].widthUnits, 3)
      assert.equal(rectangles[1].heightUnits, 5)
      assert.equal(rectangles[1].xUnits, 3)
    },
  },
  {
    name: 'routes missing-piece composite area requests to a composite area model',
    prompt: 'Find the area of a 10 by 8 rectangle with a 3 by 4 notch cut out.',
    expectedTools: ['composite_area_model'],
    inspect: (input) => {
      const rectangles = input.rectangles as Array<{ widthUnits: number; heightUnits: number }>
      const removedRectangles = input.removedRectangles as Array<{ widthUnits: number; heightUnits: number; xUnits: number }>
      assert.equal(rectangles[0].widthUnits, 10)
      assert.equal(rectangles[0].heightUnits, 8)
      assert.equal(removedRectangles[0].widthUnits, 3)
      assert.equal(removedRectangles[0].heightUnits, 4)
      assert.equal(removedRectangles[0].xUnits, 7)
    },
  },
  {
    name: 'routes coordinate distance requests to board model',
    prompt: 'Find the distance from (2, 3) to (5, 7) on the coordinate plane.',
    expectedTools: ['coordinate_distance'],
    inspect: (input) => {
      assert.deepEqual(input.pointA, { x: 2, y: 3 })
      assert.deepEqual(input.pointB, { x: 5, y: 7 })
    },
  },
  {
    name: 'routes slope requests to rise-run board model',
    prompt: 'Find the slope from (1, 2) to (5, 6).',
    expectedTools: ['slope_triangle'],
    inspect: (input) => {
      assert.deepEqual(input.pointA, { x: 1, y: 2 })
      assert.deepEqual(input.pointB, { x: 5, y: 6 })
    },
  },
  {
    name: 'routes explicit unit-rate visuals to rate and double number line',
    prompt: 'Show a double number line for the unit rate: 3 notebooks cost $6.',
    expectedTools: ['unit_rate', 'double_number_line'],
    inspect: (input) => {
      assert.equal(input.quantity, 3)
      assert.equal(input.value, 6)
    },
  },
  {
    name: 'routes review prompts through learner context before planning',
    prompt: 'Can we continue from last time and review what I struggled with?',
    expectedTools: ['learner_context', 'adaptive_review_plan', 'socratic_move_planner'],
    inspect: (input) => {
      assert.match(String(input.reason), /last time/)
    },
  },
  {
    name: 'routes class-specific prompts through curriculum context and search first',
    prompt: 'My teacher said the homework wants a ratio table: 3 cups for 12 muffins, how many cups for 20 muffins?',
    expectedTools: ['curriculum_context', 'curriculum_search', 'double_number_line'],
    inspect: (input) => {
      assert.match(String(input.reason), /homework/)
    },
  },
  {
    name: 'routes word problems through understanding map before planning',
    prompt: 'This word problem says Sam has 8 stickers and gets 5 more. How many stickers does Sam have now?',
    expectedTools: ['problem_understanding_map', 'word_problem_plan'],
    inspect: (input) => {
      assert.match(String(input.problemText), /stickers/)
    },
  },
  {
    name: 'routes representation requests to representation bridge',
    prompt: 'Can you show this ratio another way as a table?',
    expectedTools: ['representation_bridge'],
    inspect: (input) => {
      assert.equal(input.toRepresentation, 'table')
      assert.equal(input.topic, 'ratios')
    },
  },
  {
    name: 'routes worked-example requests to faded example planning',
    prompt: 'Can you show an example like this with fractions?',
    expectedTools: ['worked_example_fader'],
    inspect: (input) => {
      assert.equal(input.topic, 'fractions')
      assert.equal(input.gradeLevel, '6')
    },
  },
  {
    name: 'routes understanding-check prompts to one targeted check question',
    prompt: 'Quiz me on fractions before moving on.',
    expectedTools: ['student_check_question'],
    inspect: (input) => {
      assert.equal(input.topic, 'fractions')
      assert.equal(input.checkType, 'concept')
    },
  },
  {
    name: 'routes wrap-up prompts to an exit ticket',
    prompt: 'Can we wrap up with a two question exit ticket on ratios?',
    expectedTools: ['exit_ticket_builder'],
    inspect: (input) => {
      assert.equal(input.topic, 'ratios')
      assert.equal(input.count, 2)
    },
  },
  {
    name: 'routes off-topic child prompts to safety boundary',
    prompt: 'Tell me a dating story instead of math.',
    expectedTools: ['safety_boundary_check'],
    inspect: (input) => {
      assert.equal(input.context, 'livekit typed preview')
      assert.match(String(input.studentRequest), /dating/)
    },
  },
  {
    name: 'routes algebra solving to canvas equation solver',
    prompt: 'Solve 2x + 3 = 15 but explain the undoing operations.',
    expectedTools: ['solve_linear_on_canvas'],
    inspect: (input) => {
      assert.equal(input.problem, '2x + 3 = 15')
    },
  },
  {
    name: 'falls back to Socratic setup for ambiguous student work',
    prompt: 'I am stuck on this step and I do not know what to try.',
    expectedTools: ['socratic_move_planner', 'write_on_canvas'],
  },
]

for (const testCase of cases) {
  const plans = planLocalToolTurn(testCase.prompt, '6')
  assert.deepEqual(
    plans.map((plan) => plan.toolName),
    testCase.expectedTools,
    testCase.name
  )
  testCase.inspect?.(plans[0].input, plans)
}

const serializedBoardState = serializeTutorBoardState(mockBoardReader)
assert.match(serializedBoardState, /geometry figure/)
assert.match(serializedBoardState, /Base 8 cm/)
assert.match(serializedBoardState, /A=\\frac\{1\}\{2\}bh/)

const silentBoardContext = buildSilentTutorBoardContext(serializedBoardState)
assert.ok(isSilentTutorBoardContextText(silentBoardContext))
assert.match(silentBoardContext, /Latest structured board summary/)
assert.match(silentBoardContext, /Base 8 cm/)

const visibleMessageText = extractTutorVisibleMessageText([
  { type: 'input_text', text: silentBoardContext },
  { type: 'input_text', text: 'How do I find the area from this diagram?' },
])
assert.equal(visibleMessageText.hasSilentContext, true)
assert.equal(visibleMessageText.joined, 'How do I find the area from this diagram?')

const strippedVisibleMessage = stripSilentTutorBoardContextParts({
  type: 'message',
  role: 'user',
  content: [
    { type: 'input_text', text: silentBoardContext },
    { type: 'input_text', text: 'How do I find the area from this diagram?' },
  ],
})
assert.deepEqual(strippedVisibleMessage?.content, [
  { type: 'input_text', text: 'How do I find the area from this diagram?' },
])

const preservedVisibleMessage = stripSilentTutorBoardContextParts(
  {
    type: 'message',
    role: 'user',
    content: [
      { type: 'input_text', text: silentBoardContext },
      { type: 'input_text', text: 'How do I find the area from this diagram?' },
    ],
  },
  { preserveVisibleMessages: true }
)
assert.deepEqual(preservedVisibleMessage?.content, [
  { type: 'input_text', text: silentBoardContext },
  { type: 'input_text', text: 'How do I find the area from this diagram?' },
])

const strippedSilentImageContext = stripSilentTutorBoardContextParts({
  type: 'message',
  role: 'user',
  content: [
    { type: 'input_text', text: silentBoardContext },
    { type: 'input_image', image: 'data:image/jpeg;base64,abc' },
  ],
})
assert.equal(strippedSilentImageContext, null)

const boardAwarePlans = planLocalToolTurn('How do I find the area from this diagram?', '6', {
  boardDescription: serializedBoardState,
})
assert.deepEqual(
  boardAwarePlans.map((plan) => plan.toolName),
  ['board_state_summarizer']
)
assert.equal(boardAwarePlans[0].input.boardDescription, serializedBoardState)
assert.equal(boardAwarePlans[0].input.studentRequest, 'How do I find the area from this diagram?')

assert.match(
  buildLocalAssistantReply('graph y = x', [{ toolName: 'graph_function', input: {} }], []),
  /graph on the board/i
)
assert.match(
  buildLocalAssistantReply(
    'just tell me',
    [{ toolName: 'answer_disclosure_gate', input: {} }],
    [{ decision: 'hint_only', sayThis: 'I will start with a hint.' }]
  ),
  /start with a hint/
)
assert.match(
  buildLocalAssistantReply(
    'on the board',
    [{ toolName: 'board_state_summarizer', input: {} }],
    [{ recommendedTool: 'geometry_figure', askNext: 'How do the base and height connect?' }]
  ),
  /visible board state/i
)
assert.match(
  buildLocalAssistantReply(
    'random',
    [{ toolName: 'socratic_move_planner', input: {} }],
    [{ suggestedQuestion: 'What did you try first?' }]
  ),
  /What did you try first/
)
assert.match(
  buildLocalAssistantReply(
    'off topic',
    [{ toolName: 'safety_boundary_check', input: {} }],
    [{ sayThis: 'I can help with math here.' }]
  ),
  /math here/
)
assert.match(
  buildLocalAssistantReply(
    'why wrong',
    [{ toolName: 'mistake_pattern_classifier', input: {} }],
    [{ primaryPattern: 'denominator_operation', diagnosticQuestion: 'What common denominator could both fractions use?' }]
  ),
  /common denominator/
)
assert.match(
  buildLocalAssistantReply(
    'check this',
    [{ toolName: 'math_check_step', input: {} }],
    [{ verdict: 'invalid', reason: 'The value changed from 0.48 to 0.12.', hintTarget: 'decimal place values' }]
  ),
  /checked that step first/i
)
assert.match(
  buildLocalAssistantReply(
    'is this right',
    [{ toolName: 'math_check_step', input: {} }, { toolName: 'place_value_chart', input: {} }],
    [{ verdict: 'valid', reason: 'Both equations keep the same solution, x = 4.', hintTarget: 'inverse operations' }]
  ),
  /place-value chart/i
)
assert.match(
  buildLocalAssistantReply(
    'is this missing area right',
    [{ toolName: 'math_check_step', input: {} }, { toolName: 'composite_area_model', input: {} }],
    [{ verdict: 'invalid', reason: 'The whole area is 80 and the missing piece is 12.', hintTarget: 'subtract the missing rectangle' }]
  ),
  /whole rectangle and missing piece/
)
assert.match(
  buildLocalAssistantReply(
    'is this triangle area right',
    [{ toolName: 'math_check_step', input: {} }, { toolName: 'geometry_figure', input: { showTriangleAreaModel: true } }],
    [{ verdict: 'invalid', reason: 'The triangle area should be half the related rectangle area.', hintTarget: 'halve the base times height product' }]
  ),
  /half-rectangle triangle model/
)
assert.match(
  buildLocalAssistantReply(
    'is this angle right',
    [{ toolName: 'math_check_step', input: {} }, { toolName: 'angle_diagram', input: {} }],
    [{ verdict: 'invalid', reason: 'Supplementary angles sum to 180 degrees.', hintTarget: 'subtract from 180 degrees' }]
  ),
  /angle relationship diagram/
)
assert.match(
  buildLocalAssistantReply(
    'is this table right',
    [{ toolName: 'math_check_step', input: {} }, { toolName: 'table_of_values', input: {} }],
    [{ verdict: 'invalid', reason: 'For x = 2, y should be 5.', hintTarget: 'substitute each x-value' }]
  ),
  /value table/
)
assert.match(
  buildLocalAssistantReply(
    'is this mean right',
    [{ toolName: 'math_check_step', input: {} }, { toolName: 'statistics_summary', input: {} }],
    [{ verdict: 'invalid', reason: 'The mean is 6, not 5.', hintTarget: 'add all data values' }]
  ),
  /data summary/
)
assert.match(
  buildLocalAssistantReply(
    'which 2',
    [{ toolName: 'math_check_step', input: {} }],
    [
      {
        verdict: 'unclear',
        reason: 'There is more than one 2 in 2,020.',
        hintTarget: 'say which 2 you mean by naming its place',
      },
    ]
  ),
  /one clarification.*which 2/i
)
assert.match(
  buildLocalAssistantReply(
    'convert units',
    [{ toolName: 'unit_conversion', input: {} }],
    [{ summary: 'Prepared unit conversion: 2.5 m = 250 cm.' }]
  ),
  /unit conversion/
)
assert.match(
  buildLocalAssistantReply(
    'find slope',
    [{ toolName: 'slope_triangle', input: {} }],
    [{ summary: 'Prepared a slope triangle with rise 4, run 4, and slope 1.' }]
  ),
  /slope triangle/
)
assert.match(
  buildLocalAssistantReply(
    'make a table',
    [{ toolName: 'table_of_values', input: {} }],
    [{ summary: 'Built a value table for y = 2x + 1.' }]
  ),
  /value table/
)
assert.match(
  buildLocalAssistantReply(
    'show statistics',
    [{ toolName: 'statistics_summary', input: {} }],
    [{ summary: 'Prepared statistics summary: mean 6, median 7, range 6.' }]
  ),
  /data summary/
)
assert.match(
  buildLocalAssistantReply(
    'draw a tape diagram',
    [{ toolName: 'bar_model', input: {} }],
    [{ summary: 'Prepared a bar model.' }]
  ),
  /tape diagram/
)
assert.match(
  buildLocalAssistantReply(
    'draw a comparison tape diagram',
    [{ toolName: 'bar_model', input: { title: 'Comparison tape diagram' } }],
    [{ summary: 'Prepared a comparison bar model.' }]
  ),
  /gap represents/
)
assert.match(
  buildLocalAssistantReply(
    'show complementary angles',
    [{ toolName: 'angle_diagram', input: {} }],
    [{ summary: 'Prepared a complementary angle relationship diagram.' }]
  ),
  /angle relationship/
)
assert.match(
  buildLocalAssistantReply(
    'word problem',
    [{ toolName: 'problem_understanding_map', input: {} }],
    [{ firstTutorQuestion: 'Which quantity are we trying to find?' }]
  ),
  /knowns/
)
assert.match(
  buildLocalAssistantReply(
    'another way',
    [{ toolName: 'representation_bridge', input: {} }],
    [{ bridgeQuestion: 'What should each row stand for?' }]
  ),
  /connect those representations/
)
assert.match(
  buildLocalAssistantReply(
    'worked example',
    [{ toolName: 'worked_example_fader', input: {} }],
    [{ phases: [] }]
  ),
  /I do, we do, you do/
)
assert.match(
  buildLocalAssistantReply(
    'quiz me',
    [{ toolName: 'student_check_question', input: {} }],
    [{ question: 'What is the whole?' }]
  ),
  /What is the whole/
)
assert.match(
  buildLocalAssistantReply(
    'what should we do next',
    [{ toolName: 'tutor_response_planner', input: {} }],
    [
      {
        recommendedMove: 'check_question',
        sayFirst: 'Let us check one part before moving on.',
        askNext: 'What changed?',
        plannedSpokenTurn: 'Let us check one part before moving on. What changed?',
      },
    ]
  ),
  /What changed/
)
assert.match(
  buildLocalAssistantReply(
    'exit ticket',
    [{ toolName: 'exit_ticket_builder', input: {} }],
    [{ items: [{ prompt: 'Find the unit rate.' }] }]
  ),
  /Find the unit rate/
)

const hydratedReviewInput = hydrateLocalToolPlanInput(
  {
    toolName: 'adaptive_review_plan',
    input: {
      gradeLevel: '6',
      targetTopic: '',
      sessionGoal: 'continue',
      topics: [],
      struggleSignals: [],
      recentExcerpts: [],
    },
  },
  [
    {
      likelyTopics: ['ratios and rates'],
      struggleSignals: ['needs setup support'],
      recentExcerpts: [{ role: 'user', content: 'I was stuck on unit rates.' }],
    },
  ],
  'continue from last time',
  '6'
)
assert.deepEqual(hydratedReviewInput.topics, ['ratios and rates'])
assert.deepEqual(hydratedReviewInput.struggleSignals, ['needs setup support'])
assert.equal(hydratedReviewInput.targetTopic, 'ratios and rates')

const hydratedTableInput = hydrateLocalToolPlanInput(
  {
    toolName: 'table_of_values',
    input: {
      expression: '2x + 1',
      xValues: [0, 1, 2],
    },
  },
  [
    {
      verdict: 'invalid',
      reason: 'In the table, x = 2 should give y = 5, not 4.',
      hintTarget: 'substitute each x-value before filling the table row',
      boardFocus: {
        kind: 'table_row',
        x: 2,
        studentY: 4,
        expectedY: 5,
      },
    },
  ],
  'For y = 2x + 1, my table has (2, 4). Is that right?',
  '6'
)
assert.equal(hydratedTableInput.highlightXValue, 2)
assert.equal(hydratedTableInput.highlightLabel, 'Check x = 2 row')

console.log(`LiveKit local planner smoke passed ${cases.length} routing cases.`)
