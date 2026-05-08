import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(path: string, needle: string) {
  assert(read(path).includes(needle), `${path} should include ${needle}`)
}

function assertExcludes(path: string, needle: string) {
  assert(!read(path).includes(needle), `${path} should not include ${needle}`)
}

const documentRoute = 'app/api/curriculum/documents/route.ts'
const searchRoute = 'app/api/curriculum/search/route.ts'
const profileRoute = 'app/api/tutor/agent-profiles/route.ts'
const curriculumSearch = 'lib/curriculum/search.ts'
const liveKitRunner = 'lib/livekit/tool-runner.ts'
const browserTools = 'lib/voice-agent/tools.ts'

for (const path of [documentRoute, searchRoute, profileRoute]) {
  assertIncludes(path, 'getSessionUser()')
  assertIncludes(path, 'takeTutorApiRateLimit')
  assertExcludes(path, 'NEON_DATABASE_URL')
  assertExcludes(path, 'OPENAI_API_KEY=')
  assertExcludes(path, 'process.env.OPENAI_API_KEY')
}

assertIncludes(documentRoute, "profile?.role !== 'teacher' && profile?.role !== 'admin'")
assertIncludes(documentRoute, 'canAttachClassroom')
assertIncludes(documentRoute, 'MAX_CHUNKS_PER_DOCUMENT')
assertIncludes(documentRoute, 'visibility ===')

assertIncludes(profileRoute, "profile?.role !== 'teacher' && profile?.role !== 'admin'")
assertIncludes(profileRoute, 'teacherOwnsClassroom')
assertIncludes(profileRoute, 'instructions.length < 20')

assertIncludes(searchRoute, 'searchCurriculumForUser')
assertIncludes(curriculumSearch, 'document.owner_user_id = ${input.userId}')
assertIncludes(curriculumSearch, 'membership.user_id = ${input.userId}')
assertIncludes(curriculumSearch, 'createCurriculumEmbedding')
assertIncludes(curriculumSearch, 'plainto_tsquery')

assertIncludes(liveKitRunner, "registry.set('curriculum_search'")
assertIncludes(liveKitRunner, 'getCurriculumSearchUserId')
assertIncludes(liveKitRunner, 'searchCurriculumForUser')

assertIncludes(browserTools, "name: 'curriculum_search'")
assertIncludes(browserTools, "fetch('/api/curriculum/search'")

console.log(JSON.stringify({ ok: true, checked: 6 }))
