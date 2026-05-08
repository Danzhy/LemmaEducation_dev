import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import * as searchModule from '@/lib/curriculum/search'
import * as contextModule from '@/lib/curriculum/context'
import {
  CURRICULUM_EMBEDDING_DIMENSIONS,
  hashCurriculumText,
  vectorToSqlLiteral,
} from '@/lib/curriculum/rag'

const searchExports = searchModule as typeof import('@/lib/curriculum/search') & {
  default?: typeof import('@/lib/curriculum/search')
}
const searchCurriculumForUser =
  searchExports.searchCurriculumForUser ?? searchExports.default?.searchCurriculumForUser
const contextExports = contextModule as typeof import('@/lib/curriculum/context') & {
  default?: typeof import('@/lib/curriculum/context')
}
const getLabTutorCurriculumContextPackForUser =
  contextExports.getLabTutorCurriculumContextPackForUser ??
  contextExports.default?.getLabTutorCurriculumContextPackForUser

function loadLocalEnv() {
  try {
    const envRaw = readFileSync('.env.local', 'utf8')
    for (const line of envRaw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      const key = trimmed.slice(0, index).trim()
      let value = trimmed.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] ||= value
    }
  } catch {
    // CI can run this script without local env; skip below if the DB is not configured.
  }
}

async function main() {
  loadLocalEnv()

  if (!searchCurriculumForUser) {
    throw new Error('searchCurriculumForUser export is unavailable.')
  }
  if (!getLabTutorCurriculumContextPackForUser) {
    throw new Error('getLabTutorCurriculumContextPackForUser export is unavailable.')
  }

  if (!process.env.NEON_DATABASE_URL) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'NEON_DATABASE_URL is not configured.' }))
    return
  }

  const sql = neon(process.env.NEON_DATABASE_URL)
  const userId = `curriculum-db-smoke-${randomUUID()}`
  const documentId = randomUUID()
  const chunkId = randomUUID()
  const profileId = randomUUID()
  const content =
    'Equivalent fractions lesson: use a fraction strip to show that 1/2 and 2/4 cover the same amount before simplifying.'

  try {
    await sql`
    INSERT INTO tutor_agent_profiles (
      id,
      owner_user_id,
      classroom_id,
      name,
      grade_band,
      instructions,
      scope,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${profileId}::uuid,
      ${userId},
      NULL,
      'DB smoke tutor profile',
      'Grade 5',
      'Use fraction strips before equations and ask the student to explain the denominator.',
      'teacher_private',
      'active',
      NOW(),
      NOW()
    )
  `

    await sql`
    INSERT INTO curriculum_documents (
      id,
      owner_user_id,
      title,
      source_kind,
      visibility,
      status,
      text_sha256,
      total_chunks,
      created_at,
      updated_at
    )
    VALUES (
      ${documentId}::uuid,
      ${userId},
      'DB smoke equivalent fractions',
      'text',
      'teacher_private',
      'ready',
      ${hashCurriculumText(content)},
      1,
      NOW(),
      NOW()
    )
  `

    await sql`
    INSERT INTO curriculum_chunks (
      id,
      document_id,
      owner_user_id,
      chunk_index,
      content,
      token_estimate,
      embedding,
      embedding_model,
      created_at
    )
    VALUES (
      ${chunkId}::uuid,
      ${documentId}::uuid,
      ${userId},
      0,
      ${content},
      32,
      ${vectorToSqlLiteral(Array.from({ length: CURRICULUM_EMBEDDING_DIMENSIONS }, () => 0))}::vector,
      'smoke-test-zero-vector',
      NOW()
    )
  `

    process.env.OPENAI_API_KEY = ''
    const result = await searchCurriculumForUser({
      userId,
      query: 'equivalent fractions fraction strip',
      limit: 3,
    })

    assert.equal(result.ok, true)
    assert.equal(result.matchType, 'keyword')
    assert.equal(result.results.length, 1)
    assert.match(result.results[0].content, /fraction strip/)
    assert.match(result.instruction, /teacher-provided curriculum excerpts/i)
    const pack = await getLabTutorCurriculumContextPackForUser(userId)
    assert.equal(pack.agentProfiles.length, 1)
    assert.equal(pack.documentTitles.length, 1)
    assert.match(pack.instruction, /DB smoke tutor profile/)
    console.log(
      JSON.stringify({
        ok: true,
        matchType: result.matchType,
        results: result.results.length,
        profiles: pack.agentProfiles.length,
      })
    )
  } finally {
    await sql`DELETE FROM curriculum_documents WHERE id = ${documentId}::uuid`
    await sql`DELETE FROM tutor_agent_profiles WHERE id = ${profileId}::uuid`
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
