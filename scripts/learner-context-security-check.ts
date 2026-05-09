import { readFileSync } from 'node:fs'
import { buildLearnerMisconceptionTimeline, buildLearnerReviewSummaries } from '@/lib/tutor/learner-context'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertIncludes(path: string, needle: string) {
  assert(read(path).includes(needle), `${path} should include ${needle}`)
}

function assertExcludes(path: string, needle: string) {
  assert(!read(path).includes(needle), `${path} should not include ${needle}`)
}

const route = 'app/api/tutor/learner-context/route.ts'
const library = 'lib/tutor/learner-context.ts'
const liveKitRunner = 'lib/livekit/tool-runner.ts'
const browserTools = 'lib/voice-agent/tools.ts'
const instructions = 'lib/voice-agent/session-api-route.ts'

assertIncludes(route, 'getSessionUser()')
assertIncludes(route, 'takeTutorApiRateLimit')
assertIncludes(route, 'getTutorSessionOwnerUserId')
assertIncludes(route, "ownerUserId !== user.id")
assertIncludes(route, "endpoint: 'learner-context'")
assertExcludes(route, 'NEON_DATABASE_URL')
assertExcludes(route, 'OPENAI_API_KEY')

assertIncludes(library, 'WHERE s.user_id = ${input.userId}')
assertIncludes(library, 'WHERE user_id = ${input.userId}')
assertIncludes(library, 'MAX_EXCERPT_CHARS')
assertIncludes(library, 'misconceptionTimeline')
assertIncludes(library, 'reviewSummaries')
assertIncludes(library, 'Do not quote old session history')

assertIncludes(liveKitRunner, "registry.set('learner_context'")
assertIncludes(liveKitRunner, 'getLearnerContextUserId')
assertIncludes(liveKitRunner, 'getLearnerContextForUser')

assertIncludes(browserTools, "name: 'learner_context'")
assertIncludes(browserTools, "fetch('/api/tutor/learner-context'")
assertIncludes(instructions, 'learner_context')

const timeline = buildLearnerMisconceptionTimeline([
  {
    tool_name: 'mistake_pattern_classifier',
    created_at: '2026-05-09T18:00:00.000Z',
    output_json: {
      topic: 'fractions',
      primaryPattern: 'denominator_operation',
      severity: 'reteach',
      evidence: ['Student wrote a prior step.'],
    },
  },
  {
    tool_name: 'math_check_step',
    created_at: '2026-05-09T19:00:00.000Z',
    output_json: {
      verdict: 'invalid',
      hintTarget: 'find a common denominator before adding',
      reason: 'The checked step was invalid.',
    },
  },
])

assert(timeline.length >= 2, 'Learner timeline should aggregate structured misconception tool signals.')
assert(
  timeline.some((item) => item.signal.includes('denominator operation') && item.priority === 'reteach'),
  'Learner timeline should preserve privacy-safe classifier patterns.'
)
assert(
  !JSON.stringify(timeline).includes('Student wrote a prior step'),
  'Learner timeline should not copy raw classifier evidence into memory summaries.'
)

const reviewSummaries = buildLearnerReviewSummaries({
  hasHistory: true,
  recentSessionCount: 2,
  recentActiveMinutes: 34,
  likelyTopics: ['fractions'],
  struggleSignals: ['student says they are stuck'],
  misconceptionTimeline: timeline,
  recentTools: [{ toolName: 'math_check_step', count: 3 }],
  suggestedTutorAdjustments: ['Use a visual fraction model before symbolic steps.'],
})

assert(
  reviewSummaries.teacher.focusAreas.some((item) => /denominator|common denominator/i.test(item)),
  'Teacher memory summary should surface structured learning patterns.'
)
assert(
  reviewSummaries.parent.focusAreas.some((item) => /practice/i.test(item)),
  'Parent memory summary should turn history into practice guidance.'
)
assert(
  reviewSummaries.teacher.privacyNote.includes('raw transcript') &&
    reviewSummaries.parent.privacyNote.includes('raw chat'),
  'Adult memory summaries should include explicit privacy boundaries.'
)
assert(
  !JSON.stringify(reviewSummaries).includes('Student wrote a prior step'),
  'Adult memory summaries should not leak raw classifier evidence.'
)

console.log(JSON.stringify({ ok: true, checked: 10, timelineItems: timeline.length }))
