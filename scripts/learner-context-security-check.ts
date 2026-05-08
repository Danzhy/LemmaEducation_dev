import { readFileSync } from 'node:fs'

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
const instructions = 'app/api/voice-agent/session/route.ts'

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
assertIncludes(library, 'Do not quote old session history')

assertIncludes(liveKitRunner, "registry.set('learner_context'")
assertIncludes(liveKitRunner, 'getLearnerContextUserId')
assertIncludes(liveKitRunner, 'getLearnerContextForUser')

assertIncludes(browserTools, "name: 'learner_context'")
assertIncludes(browserTools, "fetch('/api/tutor/learner-context'")
assertIncludes(instructions, 'learner_context')

console.log(JSON.stringify({ ok: true, checked: 8 }))
