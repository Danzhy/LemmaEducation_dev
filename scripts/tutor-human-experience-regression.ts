import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import { runLiveKitTutorTool } from '@/lib/livekit/tool-runner'

type TutorExperienceCase = {
  id: string
  title: string
  gradeBand: string
  toolName: string
  input: Record<string, unknown>
  minCanvasActions?: number
  expectedSubstrings: string[]
}

const REPORT_PATH = join(process.cwd(), 'reports', 'tutor-human-experience-regression.md')

const CASES: TutorExperienceCase[] = [
  {
    id: 'fraction-misconception-hint-ladder',
    title: 'Diagnose fraction denominator addition without answer dumping',
    gradeBand: 'grades 4-6',
    toolName: 'hint_ladder',
    input: {
      topic: 'fractions',
      misconception: '',
      studentWork: '1/2 + 1/3 = 2/5',
      correctIdea: '',
    },
    expectedSubstrings: ['gentle', 'stronger', 'revealAnswer'],
  },
  {
    id: 'answer-disclosure-guardrail',
    title: 'Preserve productive struggle before a student attempt',
    gradeBand: 'grades 3-7',
    toolName: 'answer_disclosure_gate',
    input: {
      studentRequest: 'Just tell me the answer.',
      hasStudentAttempt: false,
      attemptCount: 0,
      isCheckingAnswer: false,
      askedForFullSolution: true,
    },
    expectedSubstrings: ['hint_only', 'requiredPause', 'preserve productive struggle'],
  },
  {
    id: 'topic-answer-disclosure-guardrail',
    title: 'Gate topic-specific solve requests before a student attempt',
    gradeBand: 'grades 6-7',
    toolName: 'answer_disclosure_gate',
    input: {
      studentRequest: 'Can you solve 2x + 3 = 11?',
      hasStudentAttempt: false,
      attemptCount: 0,
      isCheckingAnswer: false,
    },
    expectedSubstrings: ['hint_only', 'requiredPause', 'preserve productive struggle'],
  },
  {
    id: 'next-step-coach-stuck-work',
    title: 'Choose the next human tutor move from stuck student work',
    gradeBand: 'grades 4-6',
    toolName: 'next_step_coach',
    input: {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      studentWork: '1/2 + 1/3 = 2/5',
      goal: 'I am stuck and need help.',
    },
    expectedSubstrings: ['student_stuck', 'askNext', 'hint_ladder'],
  },
  {
    id: 'response-planner-one-question-turn',
    title: 'Plan one short spoken turn with one student question',
    gradeBand: 'grades 3-7',
    toolName: 'tutor_response_planner',
    input: {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      studentRequest: 'I got 1/2 + 1/3 = 2/5. What should we do next?',
      studentWork: '1/2 + 1/3 = 2/5',
      recentToolName: '',
      recentToolResult: '',
      hasStudentAttempt: true,
      attemptCount: 1,
    },
    expectedSubstrings: ['plannedSpokenTurn', 'voicePolicy', 'oneQuestionOnly'],
  },
  {
    id: 'short-spoken-turn-formatter',
    title: 'Trim long tutor drafts into interruptible voice chunks',
    gradeBand: 'grades 3-7',
    toolName: 'short_spoken_turn_formatter',
    input: {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      draftTurn:
        'Use a common denominator before adding. First find a denominator both fractions can share. Then rewrite each fraction. What is the whole? What denominator could both fractions use?',
      requiredQuestion: '',
      mustAskQuestion: true,
      maxWordsPerChunk: 12,
      maxChunks: 2,
    },
    expectedSubstrings: ['formattedTurn', 'extra_questions_removed', 'oneQuestionOnly'],
  },
  {
    id: 'voice-interruption-recovery',
    title: 'Resume voice tutoring from the interrupted short chunk',
    gradeBand: 'grades 3-7',
    toolName: 'voice_interruption_recovery_plan',
    input: {
      topic: 'fractions',
      gradeLevel: 'Grade 5',
      plannedTurn:
        'Use a common denominator before adding. What denominator could both fractions use?',
      studentInterruption: 'Can you say that again?',
      lastCompletedChunkOrder: 1,
      interruptedDuringChunk: false,
      requiredQuestion: 'What denominator could both fractions use?',
      currentToolName: 'short_spoken_turn_formatter',
      maxWordsPerChunk: 18,
    },
    expectedSubstrings: ['repeat', 'resumeFromChunk', 'shouldRestartExplanation'],
  },
  {
    id: 'turn-audit-one-question-policy',
    title: 'Reject multi-question voice turns before speaking',
    gradeBand: 'grades 3-7',
    toolName: 'tutor_turn_audit',
    input: {
      studentPrompt: 'Can you help with 1/2 + 1/3?',
      assistantDraft:
        'Use a common denominator before adding. What is the whole? How many equal pieces do thirds and halves need?',
      topic: 'fractions',
      toolUsed: 'fraction_operation',
    },
    expectedSubstrings: ['multiple_student_questions', 'oneQuestionOnly'],
  },
  {
    id: 'human-sequence-ratio',
    title: 'Plan a short tutor turn before ratio solving',
    gradeBand: 'grades 5-7',
    toolName: 'tutor_teaching_sequence',
    input: {
      topic: 'ratios',
      gradeLevel: 'Grade 6',
      studentGoal: 'Find the cost for 7 notebooks if 3 cost 12 dollars.',
      studentWork: '',
    },
    expectedSubstrings: ['spokenBeats', 'boardPlan', 'student_turn'],
  },
  {
    id: 'live-board-reveal',
    title: 'Create live board reveal plan for a visual explanation',
    gradeBand: 'grades 3-7',
    toolName: 'board_animation_plan',
    input: {
      concept: 'Equivalent fractions with a staged fraction bar reveal',
      visualType: 'part-whole visual reveal',
      gradeLevel: 'Grade 4',
      wantsOfflineVideo: false,
    },
    minCanvasActions: 6,
    expectedSubstrings: ['tldraw_step_reveal', 'Speak one beat', 'Reveal one mark'],
  },
  {
    id: 'function-graph',
    title: 'Draw a function graph with key features',
    gradeBand: 'grades 6-7',
    toolName: 'graph_function',
    input: {
      expression: 'x^2-4',
      showXIntercepts: true,
      showYIntercept: true,
      showVertex: true,
    },
    minCanvasActions: 18,
    expectedSubstrings: ['featureCoordinates', 'x-intercept', 'vertex'],
  },
  {
    id: 'equation-board-work',
    title: 'Show algebra steps without flooding the board',
    gradeBand: 'grades 6-7',
    toolName: 'solve_linear_on_canvas',
    input: {
      problem: '2x + 3 = 15',
      maxSteps: 2,
      stopBeforeFinal: false,
    },
    minCanvasActions: 5,
    expectedSubstrings: ['spokenSummary', 'suggestedQuestion'],
  },
  {
    id: 'geometry-area-model',
    title: 'Draw a rectangle model for area and perimeter reasoning',
    gradeBand: 'grades 3-5',
    toolName: 'area_perimeter_model',
    input: {
      widthUnits: 7,
      heightUnits: 4,
      unitLabel: 'cm',
      title: 'Area and perimeter',
      showUnitSquares: true,
    },
    minCanvasActions: 10,
    expectedSubstrings: ['canvasActions', 'area'],
  },
  {
    id: 'probability-model',
    title: 'Show favorable over total outcomes',
    gradeBand: 'grades 5-7',
    toolName: 'probability_model',
    input: {
      favorableOutcomes: 3,
      totalOutcomes: 8,
      title: 'Probability model',
    },
    minCanvasActions: 8,
    expectedSubstrings: ['Probability', '3/8'],
  },
  {
    id: 'tape-diagram-word-problem',
    title: 'Set up a part-whole word problem with a tape diagram',
    gradeBand: 'grades 3-6',
    toolName: 'bar_model',
    input: {
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
    minCanvasActions: 5,
    expectedSubstrings: ['Tape diagram', 'Unknown 22', 'canvasActions'],
  },
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function runCase(testCase: TutorExperienceCase) {
  const output = await runLiveKitTutorTool(testCase.toolName, testCase.input)
  const serialized = JSON.stringify(output)
  const canvasActions = extractCanvasActionsFromToolResult(testCase.toolName, output, 160)

  for (const expected of testCase.expectedSubstrings) {
    assert(
      serialized.includes(expected),
      `${testCase.id} did not include expected signal: ${expected}`
    )
  }

  if (testCase.minCanvasActions) {
    assert(
      canvasActions.length >= testCase.minCanvasActions,
      `${testCase.id} expected at least ${testCase.minCanvasActions} canvas actions, got ${canvasActions.length}`
    )
  }

  return {
    ...testCase,
    canvasActions: canvasActions.length,
    outputBytes: new TextEncoder().encode(serialized).length,
  }
}

function writeReport(results: Awaited<ReturnType<typeof runCase>>[]) {
  mkdirSync(join(process.cwd(), 'reports'), { recursive: true })
  const rows = results.map(
    (result) =>
      `| ${result.id} | ${result.gradeBand} | ${result.toolName} | ${result.canvasActions} | ${result.outputBytes} |`
  )
  const report = `# Tutor Human Experience Regression

Generated: ${new Date().toISOString()}

This report is local-only and ignored by git. It checks whether hidden lab tools still support human-tutor behaviors: diagnose before correcting, reveal board work gradually, draw useful visuals, and preserve student thinking.

| Case | Grade band | Tool | Canvas actions | Output bytes |
| --- | --- | --- | --- | --- |
${rows.join('\n')}
`
  writeFileSync(REPORT_PATH, report)
}

async function main() {
  const results = []
  for (const testCase of CASES) {
    results.push(await runCase(testCase))
  }

  writeReport(results)

  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: results.length,
        reportPath: REPORT_PATH,
        maxOutputBytes: Math.max(...results.map((result) => result.outputBytes)),
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
