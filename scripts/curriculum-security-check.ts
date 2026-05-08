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
const documentArchiveRoute = 'app/api/curriculum/documents/[documentId]/route.ts'
const contextRoute = 'app/api/curriculum/context/route.ts'
const extractRoute = 'app/api/curriculum/extract/route.ts'
const searchRoute = 'app/api/curriculum/search/route.ts'
const profileRoute = 'app/api/tutor/agent-profiles/route.ts'
const profileArchiveRoute = 'app/api/tutor/agent-profiles/[profileId]/route.ts'
const curriculumSearch = 'lib/curriculum/search.ts'
const curriculumPdf = 'lib/curriculum/pdf.ts'
const liveKitRunner = 'lib/livekit/tool-runner.ts'
const browserTools = 'lib/voice-agent/tools.ts'

for (const path of [documentRoute, documentArchiveRoute, contextRoute, extractRoute, searchRoute, profileRoute, profileArchiveRoute]) {
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
assertIncludes(documentArchiveRoute, "profile?.role !== 'teacher' && profile?.role !== 'admin'")
assertIncludes(documentArchiveRoute, 'owner_user_id = ${user.id}')
assertIncludes(documentArchiveRoute, "SET status = 'archived'")
assertIncludes(contextRoute, 'getLabTutorCurriculumContextPackForUser')
assertIncludes(contextRoute, "endpoint: 'curriculum-context'")
assertIncludes(extractRoute, "endpoint: 'curriculum-extract'")
assertIncludes(extractRoute, 'MAX_CURRICULUM_PDF_BYTES')
assertIncludes(extractRoute, "runtime = 'nodejs'")
assertIncludes(curriculumPdf, 'looksLikePdf')
assertIncludes(curriculumPdf, 'sanitizeCurriculumText')

assertIncludes(profileRoute, "profile?.role !== 'teacher' && profile?.role !== 'admin'")
assertIncludes(profileRoute, 'teacherOwnsClassroom')
assertIncludes(profileRoute, 'instructions.length < 20')
assertIncludes(profileArchiveRoute, "profile?.role !== 'teacher' && profile?.role !== 'admin'")
assertIncludes(profileArchiveRoute, 'owner_user_id = ${user.id}')
assertIncludes(profileArchiveRoute, "SET status = 'archived'")

assertIncludes(searchRoute, 'searchCurriculumForUser')
assertIncludes(curriculumSearch, 'document.owner_user_id = ${input.userId}')
assertIncludes(curriculumSearch, 'membership.user_id = ${input.userId}')
assertIncludes(curriculumSearch, 'createCurriculumEmbedding')
assertIncludes(curriculumSearch, 'plainto_tsquery')

assertIncludes(liveKitRunner, "registry.set('curriculum_context'")
assertIncludes(liveKitRunner, "registry.set('curriculum_search'")
assertIncludes(liveKitRunner, 'getCurriculumSearchUserId')
assertIncludes(liveKitRunner, 'searchCurriculumForUser')

assertIncludes(browserTools, "name: 'curriculum_context'")
assertIncludes(browserTools, "name: 'curriculum_search'")
assertIncludes(browserTools, "fetch('/api/curriculum/context'")
assertIncludes(browserTools, "fetch('/api/curriculum/search'")

console.log(JSON.stringify({ ok: true, checked: 11 }))
