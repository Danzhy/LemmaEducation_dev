import { getNeonSql } from '@/lib/tutor/db'
import {
  createCurriculumEmbedding,
  sanitizeCurriculumText,
  vectorToSqlLiteral,
} from '@/lib/curriculum/rag'
import { getTutorSessionOwnerUserId } from '@/lib/tutor/history'

const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 8
const MAX_QUERY_CHARS = 500

export type CurriculumSearchResult = {
  documentId: string
  documentTitle: string
  sourceName: string | null
  chunkIndex: number
  content: string
  score: number
  matchType: 'vector' | 'keyword'
}

export type CurriculumSearchResponse = {
  ok: true
  query: string
  matchType: 'vector' | 'keyword' | 'none'
  results: CurriculumSearchResult[]
  instruction: string
}

function isMissingCurriculumSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /curriculum_documents|curriculum_chunks|tutor_agent_profiles|vector|does not exist|relation .* does not exist/i.test(message)
}

function normalizeSearchQuery(value: string) {
  return sanitizeCurriculumText(value).replace(/\s+/g, ' ').slice(0, MAX_QUERY_CHARS).trim()
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_SEARCH_LIMIT
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(value ?? DEFAULT_SEARCH_LIMIT)))
}

function toSearchResult(row: Record<string, unknown>, matchType: 'vector' | 'keyword'): CurriculumSearchResult {
  return {
    documentId: String(row.document_id ?? ''),
    documentTitle: String(row.document_title ?? 'Curriculum document'),
    sourceName: typeof row.source_name === 'string' ? row.source_name : null,
    chunkIndex: Number(row.chunk_index ?? 0),
    content: String(row.content ?? ''),
    score: Number(row.score ?? 0),
    matchType,
  }
}

function buildCurriculumSearchInstruction(query: string, results: CurriculumSearchResult[]) {
  if (results.length === 0) {
    return `No teacher-provided curriculum match was found for "${query}". Ask a clarifying math question or continue with general grade-level tutoring.`
  }

  const excerpts = results
    .slice(0, 4)
    .map((result, index) => {
      const source = result.sourceName ? `${result.documentTitle} (${result.sourceName})` : result.documentTitle
      return `${index + 1}. ${source}: ${result.content.slice(0, 520)}`
    })
    .join('\n\n')

  return [
    `Use these teacher-provided curriculum excerpts for "${query}".`,
    excerpts,
    'Do not quote long passages to the student. Use the excerpts to choose examples, vocabulary, pacing, and next hints.',
  ].join('\n\n')
}

export async function getCurriculumSearchUserId(input: {
  userId?: string | null
  sessionId?: string | null
}) {
  if (input.userId) return input.userId
  if (!input.sessionId) return null
  return getTutorSessionOwnerUserId(input.sessionId)
}

export async function searchCurriculumForUser(input: {
  userId: string
  query: string
  classroomId?: string | null
  limit?: number
}): Promise<CurriculumSearchResponse> {
  const query = normalizeSearchQuery(input.query)
  if (query.length < 2) {
    return {
      ok: true,
      query,
      matchType: 'none',
      results: [],
      instruction: 'No usable curriculum query was provided.',
    }
  }

  const sql = getNeonSql()
  const limit = normalizeLimit(input.limit)
  const classroomId = input.classroomId?.trim() || null

  try {
    const embedding = await createCurriculumEmbedding(query)
    const vector = vectorToSqlLiteral(embedding.embedding)
    const rows = await sql`
      SELECT
        chunk.document_id,
        document.title AS document_title,
        document.source_name,
        chunk.chunk_index,
        chunk.content,
        1 - (chunk.embedding <=> ${vector}::vector) AS score
      FROM curriculum_chunks chunk
      INNER JOIN curriculum_documents document ON document.id = chunk.document_id
      WHERE document.status = 'ready'
        AND (${classroomId}::uuid IS NULL OR document.classroom_id = ${classroomId}::uuid)
        AND (
          document.owner_user_id = ${input.userId}
          OR (
            document.visibility = 'classroom'
            AND EXISTS (
              SELECT 1
              FROM classroom_memberships membership
              WHERE membership.classroom_id = document.classroom_id
                AND membership.user_id = ${input.userId}
            )
          )
        )
      ORDER BY chunk.embedding <=> ${vector}::vector
      LIMIT ${limit}
    `

    const results = (rows as Array<Record<string, unknown>>).map((row) => toSearchResult(row, 'vector'))
    return {
      ok: true,
      query,
      matchType: results.length > 0 ? 'vector' : 'none',
      results,
      instruction: buildCurriculumSearchInstruction(query, results),
    }
  } catch (error) {
    if (!isMissingCurriculumSchema(error) && !(error instanceof Error && /OPENAI_API_KEY|Embedding request/.test(error.message))) {
      throw error
    }
  }

  try {
    const rows = await sql`
      SELECT
        chunk.document_id,
        document.title AS document_title,
        document.source_name,
        chunk.chunk_index,
        chunk.content,
        ts_rank_cd(to_tsvector('english', chunk.content), plainto_tsquery('english', ${query})) AS score
      FROM curriculum_chunks chunk
      INNER JOIN curriculum_documents document ON document.id = chunk.document_id
      WHERE document.status = 'ready'
        AND (${classroomId}::uuid IS NULL OR document.classroom_id = ${classroomId}::uuid)
        AND to_tsvector('english', chunk.content) @@ plainto_tsquery('english', ${query})
        AND (
          document.owner_user_id = ${input.userId}
          OR (
            document.visibility = 'classroom'
            AND EXISTS (
              SELECT 1
              FROM classroom_memberships membership
              WHERE membership.classroom_id = document.classroom_id
                AND membership.user_id = ${input.userId}
            )
          )
        )
      ORDER BY score DESC, document.updated_at DESC
      LIMIT ${limit}
    `

    const results = (rows as Array<Record<string, unknown>>).map((row) => toSearchResult(row, 'keyword'))
    return {
      ok: true,
      query,
      matchType: results.length > 0 ? 'keyword' : 'none',
      results,
      instruction: buildCurriculumSearchInstruction(query, results),
    }
  } catch (error) {
    if (isMissingCurriculumSchema(error)) {
      return {
        ok: true,
        query,
        matchType: 'none',
        results: [],
        instruction: 'Curriculum search is not enabled in this database yet.',
      }
    }
    throw error
  }
}
