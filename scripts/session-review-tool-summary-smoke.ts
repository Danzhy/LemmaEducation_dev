import {
  shouldShowRawToolPayloads,
  summarizeSessionEvidenceForReview,
  summarizeToolEventForReview,
} from '../lib/tutor/tool-event-review'
import { buildSessionFollowUpPractice } from '../lib/tutor/session-follow-up'
import { buildSessionReviewFilename, buildSessionReviewMarkdown } from '../lib/tutor/session-review-export'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function summaryText(summary: ReturnType<typeof summarizeToolEventForReview>) {
  return [summary.headline, ...summary.details].join(' ')
}

const curriculumSummary = summarizeToolEventForReview({
  eventType: 'tool_completed',
  toolName: 'curriculum_search',
  status: 'completed',
  output: {
    matches: [
      {
        title: 'Private worksheet',
        excerpt: 'Answer key: use 24 because this is the teacher-only note.',
      },
    ],
  },
})
const curriculumText = summaryText(curriculumSummary)
assert(
  curriculumText.includes('raw excerpts are hidden'),
  'Curriculum summaries should say raw excerpts are hidden.'
)
assert(
  !curriculumText.includes('Answer key') && !curriculumText.includes('teacher-only note'),
  'Curriculum summaries must not leak raw uploaded content.'
)

const stepSummary = summarizeToolEventForReview({
  eventType: 'tool_completed',
  toolName: 'math_check_step',
  status: 'completed',
  output: {
    verdict: 'invalid',
    reason: 'The value changed from 0.5 to 0.4.',
    hintTarget: 'recheck the common denominator',
  },
})
const stepText = summaryText(stepSummary)
assert(stepText.includes('invalid'), 'Step-check summaries should include the verdict.')
assert(
  stepText.includes('common denominator'),
  'Step-check summaries should keep the tutor focus visible.'
)
assert(
  !stepText.includes('0.5') && !stepText.includes('0.4'),
  'Step-check summaries should avoid dumping raw calculation payloads.'
)

const masterySummary = summarizeToolEventForReview({
  eventType: 'tool_completed',
  toolName: 'session_mastery_snapshot',
  status: 'completed',
  input: {
    transcriptExcerpt: 'Private transcript: my older sibling did the first one for me.',
    studentWork: 'Private student work scratchpad.',
  },
  output: {
    label: 'Fraction addition',
    confidence: 'medium',
    needsReview: ['Check whether the whole is the same size before adding parts.'],
    teacherReviewNote: 'Review fraction addition with one short diagnostic before moving faster.',
    suggestedNextTutorMove: 'Ask the student to draw two same-size fraction strips before adding.',
  },
})
const masteryText = summaryText(masterySummary)
assert(
  masteryText.includes('Fraction addition') && masteryText.includes('medium confidence'),
  'Mastery snapshots should surface teacher-safe confidence and topic evidence.'
)
assert(
  masteryText.includes('short diagnostic') && masteryText.includes('fraction strips'),
  'Mastery snapshots should keep the review note and next tutor move visible.'
)
assert(
  masteryText.includes('Raw transcript, student work, and tool payloads remain hidden'),
  'Mastery snapshots should explain that raw learning artifacts stay hidden.'
)
assert(
  !masteryText.includes('older sibling') && !masteryText.includes('scratchpad'),
  'Mastery snapshot summaries must not leak raw transcript or student work input.'
)

const canvasSummary = summarizeToolEventForReview({
  eventType: 'canvas_action',
  toolName: 'graph_function',
  status: 'completed',
  output: [{ type: 'draw_axes' }, { type: 'plot_polyline' }],
})
assert(
  summaryText(canvasSummary).includes('2 structured canvas actions'),
  'Canvas summaries should count structured board actions.'
)

const evidenceSummary = summarizeSessionEvidenceForReview([
  {
    eventType: 'tool_completed',
    toolName: 'math_check_step',
    status: 'completed',
    input: {
      previousStep: 'Private scratch: 1/2 + 1/3',
      nextStep: 'Private scratch: 2/5',
    },
    output: {
      verdict: 'invalid',
      reason: 'Private calculation detail should not appear in the aggregate.',
      hintTarget: 'recheck the common denominator',
    },
  },
  {
    eventType: 'tool_completed',
    toolName: 'mistake_pattern_classifier',
    status: 'completed',
    output: {
      primaryPattern: 'adding_denominators',
      severity: 'high',
      evidence: 'Raw student wording should stay hidden.',
    },
  },
  {
    eventType: 'tool_completed',
    toolName: 'session_mastery_snapshot',
    status: 'completed',
    input: {
      transcriptExcerpt: 'Private transcript about a family situation.',
    },
    output: {
      label: 'Fraction addition',
      confidence: 'low',
      needsReview: ['Check whether the whole is the same size before adding parts.'],
      suggestedNextTutorMove: 'Ask the student to draw two same-size fraction strips before adding.',
    },
  },
  {
    eventType: 'tool_completed',
    toolName: 'fraction_strip',
    status: 'completed',
    output: {
      summary: 'Prepared fraction strips.',
      canvasActions: [{ type: 'place_text_label' }, { type: 'draw_rect' }],
    },
  },
])
assert(evidenceSummary, 'Evidence summaries should be present when learning tool events exist.')
const evidenceText = [evidenceSummary.headline, ...evidenceSummary.details].join(' ')
assert(
  evidenceText.includes('Step checks: 1 needs review') &&
    evidenceText.includes('adding denominators') &&
    evidenceText.includes('Fraction addition: low confidence') &&
    evidenceText.includes('2 structured canvas actions'),
  'Evidence summaries should aggregate step checks, misconception signals, mastery snapshots, and board actions.'
)
assert(
  evidenceText.includes('recheck the common denominator') &&
    evidenceText.includes('two same-size fraction strips'),
  'Evidence summaries should keep safe review focus and next tutor moves visible.'
)
assert(
  evidenceText.includes('private learner context') &&
    !evidenceText.includes('family situation') &&
    !evidenceText.includes('Private scratch') &&
    !evidenceText.includes('Raw student wording') &&
    !evidenceText.includes('Private calculation detail'),
  'Evidence summaries must not leak raw inputs, raw evidence, or calculation payloads.'
)

assert(
  summarizeSessionEvidenceForReview([
    {
      eventType: 'tool_completed',
      toolName: 'curriculum_search',
      status: 'completed',
      output: { matches: [{ excerpt: 'Private worksheet text.' }] },
    },
  ]) === null,
  'Evidence summaries should stay hidden when only private curriculum context exists.'
)

assert(
  shouldShowRawToolPayloads('admin', '1'),
  'Admins should be able to opt into raw tool payloads with debugTools=1.'
)
assert(
  shouldShowRawToolPayloads('admin', ['0', 'true']),
  'Admins should be able to opt into raw tool payloads with debugTools=true.'
)
assert(
  !shouldShowRawToolPayloads('admin', undefined),
  'Admin raw payloads should stay off by default.'
)
assert(
  !shouldShowRawToolPayloads('teacher', '1') &&
    !shouldShowRawToolPayloads('parent', '1') &&
    !shouldShowRawToolPayloads('student', '1'),
  'Only admins should be able to reveal raw tool payloads.'
)

const targetedFollowUp = buildSessionFollowUpPractice({
  gradeLevel: 'Grade 6',
  messages: [],
  toolEvents: [
    {
      id: 'event-1',
      eventType: 'tool_completed',
      toolName: 'math_check_step',
      status: 'completed',
      input: {
        previousStep: 'Private scratch: 1/2 + 1/3',
        nextStep: 'Private scratch: 2/5',
      },
      output: {
        verdict: 'invalid',
        reason: 'The student added the denominators.',
        hintTarget: 'recheck the common denominator',
      },
      metadata: null,
      createdAt: new Date(),
    },
  ],
})
assert(targetedFollowUp, 'Follow-up practice should be generated from review evidence.')
assert(
  targetedFollowUp.topic === 'fractions' && targetedFollowUp.items.length === 3,
  'Follow-up practice should map denominator evidence to a short fraction practice set.'
)
const targetedFollowUpText = JSON.stringify(targetedFollowUp)
assert(
  targetedFollowUpText.includes('common denominator') &&
    !targetedFollowUpText.includes('Private scratch') &&
    !targetedFollowUpText.includes('2/5'),
  'Follow-up practice should keep the safe focus while hiding raw scratch payloads.'
)
assert(
  !targetedFollowUpText.includes('answer'),
  'Follow-up practice should not expose the answer key in the dashboard.'
)

const transcriptFollowUp = buildSessionFollowUpPractice({
  gradeLevel: 'Grade 7',
  messages: [
    {
      id: 'message-1',
      role: 'user',
      content: 'Can you help me solve x + 7 = 19?',
      source: 'text',
      createdAt: new Date(),
    },
  ],
  toolEvents: [],
})
assert(
  transcriptFollowUp?.topic === 'expressions_equations',
  'Follow-up practice should infer equation review from recent student prompts when tool evidence is absent.'
)

const reviewExport = buildSessionReviewMarkdown({
  id: '7e6e3f1a-56df-43ea-9aaa-2b884159622f',
  startedAt: new Date('2026-05-10T09:00:00.000Z'),
  endedAt: new Date('2026-05-10T09:12:00.000Z'),
  activeSeconds: 720,
  endedReason: 'user_ended',
  modelSnapshot: 'gpt-realtime-1.5',
  language: 'en',
  gradeLevel: 'Grade 6',
  userMessageCount: 1,
  assistantMessageCount: 1,
  hasCanvasSnapshot: true,
  artifactUpdatedAt: new Date('2026-05-10T09:12:00.000Z'),
  messages: [
    {
      id: 'message-2',
      role: 'user',
      content: 'Private transcript: my parent helped with the first step.',
      source: 'text',
      createdAt: new Date(),
    },
  ],
  toolEvents: [
    {
      id: 'event-2',
      eventType: 'tool_completed',
      toolName: 'session_mastery_snapshot',
      status: 'completed',
      input: {
        transcriptExcerpt: 'Private transcript about a family situation.',
      },
      output: {
        label: 'Fraction addition',
        confidence: 'low',
        needsReview: ['Check whether the whole is the same size before adding parts.'],
        suggestedNextTutorMove: 'Ask the student to draw two same-size fraction strips before adding.',
      },
      metadata: null,
      createdAt: new Date(),
    },
  ],
})
assert(reviewExport.includes('# Lemma Session Review'), 'Review exports should be markdown documents.')
assert(
  reviewExport.includes('Fraction addition') &&
    reviewExport.includes('Follow-up Practice') &&
    reviewExport.includes('A final board snapshot was saved'),
  'Review exports should include safe evidence, follow-up practice, and board metadata.'
)
assert(
  reviewExport.includes('teacher-safe summary') &&
    !reviewExport.includes('family situation') &&
    !reviewExport.includes('my parent helped') &&
    !reviewExport.includes('Private transcript'),
  'Review exports must not include private transcript snippets or raw tool inputs.'
)
assert(
  buildSessionReviewFilename('7e6e3f1a-56df-43ea-9aaa-2b884159622f') ===
    'lemma-session-7e6e3f1a-56d-review.md',
  'Review export filenames should be stable and sanitized.'
)

console.log('Session review tool summary smoke checks passed.')
