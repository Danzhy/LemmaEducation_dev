import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const workflowHelper = 'lib/school/workflow-rate-limit.ts'
const protectedRoutes = [
  'app/api/classrooms/route.ts',
  'app/api/classrooms/join/route.ts',
  'app/api/livekit-pipeline/models/route.ts',
  'app/api/livekit/status/route.ts',
  'app/api/profile/onboarding/route.ts',
  'app/api/student-access-codes/route.ts',
  'app/api/student-access-codes/claim/route.ts',
  'app/api/tutor/follow-up-draft/route.ts',
  'app/api/tutor/sessions/[sessionId]/review-export/route.ts',
]

const helperSource = read(workflowHelper)
assert(helperSource.includes('getTrustedClientIp'), 'School workflow limits should bind to trusted IP.')
assert(helperSource.includes('user:${options.userId}'), 'School workflow limits should bind to the user.')
assert(helperSource.includes("endpoint: `school:${options.endpoint}`"), 'School workflow limits should use school endpoint namespace.')

for (const route of protectedRoutes) {
  const source = read(route)
  assert(source.includes('takeSchoolWorkflowRateLimit'), `${route} should apply a durable workflow rate limit.`)
  assert(source.includes('Retry-After'), `${route} should return Retry-After on rate limits.`)
  assert(source.includes('schoolRateLimitResponse'), `${route} should return a standard rate-limit code.`)
}

console.log(JSON.stringify({ ok: true, checkedRoutes: protectedRoutes.length }))
