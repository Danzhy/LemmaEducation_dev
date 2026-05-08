import {
  shouldShowRawToolPayloads,
  summarizeToolEventForReview,
} from '../lib/tutor/tool-event-review'

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

console.log('Session review tool summary smoke checks passed.')
