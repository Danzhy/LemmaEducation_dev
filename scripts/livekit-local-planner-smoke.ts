import assert from 'node:assert/strict'
import {
  buildLocalAssistantReply,
  hydrateLocalToolPlanInput,
  planLocalToolTurn,
} from '@/lib/livekit/local-tool-planner'

type PlannerCase = {
  name: string
  prompt: string
  expectedTools: string[]
  inspect?: (firstInput: Record<string, unknown>) => void
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
    name: 'routes percent-of-number to calculator plus visual bar',
    prompt: 'What is 25% of 80? Show me the thinking.',
    expectedTools: ['percent_of_number', 'percent_bar'],
    inspect: (input) => {
      assert.equal(input.percent, 25)
      assert.equal(input.whole, 80)
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
    name: 'checks explicit algebra rewrite before classifying the step',
    prompt: 'I changed 2x + 3 = 11 to 2x = 8. Is that right?',
    expectedTools: ['math_check_step', 'mistake_pattern_classifier'],
    inspect: (input) => {
      assert.equal(input.previousStep, '2x + 3 = 11')
      assert.equal(input.nextStep, '2x = 8')
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
    name: 'routes unit-rate word problems to rate and double number line',
    prompt: 'A store sells 3 notebooks for $6. What is the unit rate?',
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
  testCase.inspect?.(plans[0].input)
}

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
    [{ toolName: 'math_check_step', input: {} }],
    [{ verdict: 'valid', reason: 'Both equations keep the same solution, x = 4.', hintTarget: 'inverse operations' }]
  ),
  /stays equivalent/i
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

console.log(`LiveKit local planner smoke passed ${cases.length} routing cases.`)
