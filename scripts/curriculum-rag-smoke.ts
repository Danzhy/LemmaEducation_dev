import assert from 'node:assert/strict'
import {
  CURRICULUM_EMBEDDING_DIMENSIONS,
  buildCurriculumContextInstruction,
  chunkCurriculumText,
  estimateTokens,
  hashCurriculumText,
  sanitizeCurriculumText,
  vectorToSqlLiteral,
} from '@/lib/curriculum/rag'
import {
  assessCurriculumSearchQuality,
  buildCurriculumSearchInstruction,
  type CurriculumSearchResult,
} from '@/lib/curriculum/search'

const rawText = `
  Lesson 3: Equivalent fractions

  Students should explain why 1/2 and 2/4 name the same amount using a fraction strip.

  Homework note: ask students to compare 3/6 and 4/8 before simplifying.
`

const sanitized = sanitizeCurriculumText(rawText)
assert(!sanitized.includes('  '), 'Curriculum text should normalize repeated spaces.')
assert(sanitized.includes('Equivalent fractions'), 'Curriculum text should preserve lesson content.')

const chunks = chunkCurriculumText(rawText)
assert(chunks.length >= 1, 'Curriculum chunking should produce at least one chunk.')
assert.equal(chunks[0].chunkIndex, 0, 'Chunk indexes should start at zero.')
assert(chunks[0].tokenEstimate > 0, 'Chunks should include token estimates.')

const longText = 'ratio table '.repeat(900)
const longChunks = chunkCurriculumText(longText)
assert(longChunks.length > 1, 'Long curriculum text should split into multiple chunks.')
assert(longChunks.every((chunk) => chunk.content.length <= 1200), 'Chunks should stay under the configured max size.')

assert.equal(estimateTokens('abcd'), 1, 'Token estimates should be at least one token.')
assert.equal(hashCurriculumText('same'), hashCurriculumText('same'), 'Curriculum text hashing should be stable.')
assert.notEqual(hashCurriculumText('same'), hashCurriculumText('different'), 'Curriculum hashing should distinguish content.')

const vectorLiteral = vectorToSqlLiteral(Array.from({ length: CURRICULUM_EMBEDDING_DIMENSIONS }, () => 0.125))
assert(vectorLiteral.startsWith('[') && vectorLiteral.endsWith(']'), 'Embedding vectors should serialize as pgvector literals.')
assert.throws(() => vectorToSqlLiteral([1, 2, 3]), /Expected 1536 embedding dimensions/, 'Vector dimension checks should be strict.')

const instruction = buildCurriculumContextInstruction({
  agentProfiles: [
    {
      name: 'Grade 6 ratios support',
      gradeBand: 'Grades 5-6',
      instructions: 'Use double number lines before equations. Ask students to say what one unit means.',
    },
  ],
  documentTitles: ['Ratios Unit 1 Lesson Notes'],
})
assert(instruction.includes('Teacher-provided curriculum context'), 'Context instruction should identify teacher context.')
assert(instruction.includes('Grade 6 ratios support'), 'Context instruction should include active custom profiles.')
assert(instruction.includes('Ratios Unit 1 Lesson Notes'), 'Context instruction should include curriculum document titles.')

const strongKeywordResult: CurriculumSearchResult = {
  documentId: 'doc-fractions',
  documentTitle: 'Equivalent Fractions Lesson',
  sourceName: 'teacher notes',
  chunkIndex: 0,
  content: 'Use fraction strips to compare equivalent fractions before simplifying.',
  score: 0.42,
  matchType: 'keyword',
}
const strongKeywordQuality = assessCurriculumSearchQuality({
  query: 'equivalent fractions fraction strip',
  matchType: 'keyword',
  results: [strongKeywordResult],
})
assert.equal(strongKeywordQuality.quality, 'strong', 'Keyword matches should be usable when curriculum text contains query terms.')
const strongKeywordInstruction = buildCurriculumSearchInstruction('equivalent fractions fraction strip', [strongKeywordResult], strongKeywordQuality)
assert(
  strongKeywordInstruction.includes('Use these teacher-provided curriculum excerpts'),
  'Strong curriculum matches should produce usable excerpt instructions.'
)
assert(strongKeywordInstruction.includes('fraction strips'), 'Strong curriculum matches should include the relevant excerpt.')

const weakVectorResult: CurriculumSearchResult = {
  documentId: 'doc-unrelated',
  documentTitle: 'Classroom routines',
  sourceName: 'teacher-only answer key',
  chunkIndex: 0,
  content: 'Answer key: students may use silent reading time after finishing the warmup.',
  score: 0.03,
  matchType: 'vector',
}
const weakVectorQuality = assessCurriculumSearchQuality({
  query: 'divide decimals with hundredths',
  matchType: 'vector',
  results: [weakVectorResult],
})
assert.equal(weakVectorQuality.quality, 'weak', 'Low-score unrelated vector matches should be treated as weak retrieval.')
const weakVectorInstruction = buildCurriculumSearchInstruction('divide decimals with hundredths', [], weakVectorQuality)
assert(
  weakVectorInstruction.includes('Ask one clarifying question') && weakVectorInstruction.includes('Do not claim the class materials covered this'),
  'Weak curriculum matches should tell the tutor to clarify or fall back safely.'
)
assert(!weakVectorInstruction.includes('Answer key'), 'Weak curriculum matches should not expose unrelated private excerpts.')

console.log('Curriculum RAG smoke test passed.')
