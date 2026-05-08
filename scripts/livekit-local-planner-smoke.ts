import assert from 'node:assert/strict'
import {
  buildLocalAssistantReply,
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
    name: 'routes unit-rate word problems to rate and double number line',
    prompt: 'A store sells 3 notebooks for $6. What is the unit rate?',
    expectedTools: ['unit_rate', 'double_number_line'],
    inspect: (input) => {
      assert.equal(input.quantity, 3)
      assert.equal(input.value, 6)
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

console.log(`LiveKit local planner smoke passed ${cases.length} routing cases.`)
