import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { getCurrentUserProfile } from '@/lib/school/profiles'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import {
  chunkCurriculumText,
  createCurriculumEmbedding,
  hashCurriculumText,
  sanitizeCurriculumText,
  vectorToSqlLiteral,
} from '@/lib/curriculum/rag'

const MAX_TITLE_CHARS = 160
const MAX_SOURCE_NAME_CHARS = 180
const MAX_CHUNKS_PER_DOCUMENT = 80
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

async function canAttachClassroom(input: {
  sql: ReturnType<typeof getNeonSql>
  teacherUserId: string
  classroomId: string
}) {
  const rows = await input.sql`
    SELECT id
    FROM classrooms
    WHERE id = ${input.classroomId}::uuid
      AND teacher_user_id = ${input.teacherUserId}
      AND archived_at IS NULL
    LIMIT 1
  `
  return Boolean(rows[0])
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const profile = await getCurrentUserProfile()
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only teachers can upload curriculum documents.' },
        { status: 403 }
      )
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'curriculum-document',
      userId: user.id,
      maxHits: 30,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many curriculum uploads.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json().catch(() => null)) as {
      title?: unknown
      sourceName?: unknown
      sourceText?: unknown
      classroomId?: unknown
      visibility?: unknown
    } | null

    const title = parseString(body?.title, MAX_TITLE_CHARS)
    const sourceName = parseString(body?.sourceName, MAX_SOURCE_NAME_CHARS) || null
    const sourceText = sanitizeCurriculumText(typeof body?.sourceText === 'string' ? body.sourceText : '')
    const classroomId = parseString(body?.classroomId, 80)
    const visibility = body?.visibility === 'classroom' ? 'classroom' : 'teacher_private'

    if (title.length < 2) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Use a clear document title.' }, { status: 400 })
    }
    if (sourceText.length < 40) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Add at least a short page of curriculum text.' },
        { status: 400 }
      )
    }
    if (classroomId && !UUID_PATTERN.test(classroomId)) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid classroom id.' }, { status: 400 })
    }
    if (visibility === 'classroom' && !classroomId) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Classroom visibility requires a classroom.' },
        { status: 400 }
      )
    }
    if (classroomId) {
      const allowed = await canAttachClassroom({ sql, teacherUserId: user.id, classroomId })
      if (!allowed && profile.role !== 'admin') {
        return NextResponse.json(
          { ok: false, code: 'FORBIDDEN', message: 'You can only attach documents to your own classes.' },
          { status: 403 }
        )
      }
    }

    const chunks = chunkCurriculumText(sourceText).slice(0, MAX_CHUNKS_PER_DOCUMENT)
    if (chunks.length === 0) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Could not split document text.' }, { status: 400 })
    }

    const documentId = randomUUID()
    await sql`
      INSERT INTO curriculum_documents (
        id,
        owner_user_id,
        classroom_id,
        title,
        source_name,
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
        ${user.id},
        ${classroomId || null}::uuid,
        ${title},
        ${sourceName},
        'text',
        ${visibility},
        'processing',
        ${hashCurriculumText(sourceText)},
        ${chunks.length},
        NOW(),
        NOW()
      )
    `

    try {
      for (const chunk of chunks) {
        const embedding = await createCurriculumEmbedding(chunk.content)
        await sql`
          INSERT INTO curriculum_chunks (
            id,
            document_id,
            owner_user_id,
            classroom_id,
            chunk_index,
            content,
            token_estimate,
            embedding,
            embedding_model,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${documentId}::uuid,
            ${user.id},
            ${classroomId || null}::uuid,
            ${chunk.chunkIndex},
            ${chunk.content},
            ${chunk.tokenEstimate},
            ${vectorToSqlLiteral(embedding.embedding)}::vector,
            ${embedding.model},
            NOW()
          )
        `
      }

      await sql`
        UPDATE curriculum_documents
        SET status = 'ready', updated_at = NOW()
        WHERE id = ${documentId}::uuid
      `
    } catch (error) {
      await sql`
        UPDATE curriculum_documents
        SET status = 'failed', updated_at = NOW()
        WHERE id = ${documentId}::uuid
      `.catch(() => undefined)
      throw error
    }

    return NextResponse.json({ ok: true, documentId, chunks: chunks.length })
  } catch (error) {
    console.error('[curriculum/documents]', error)
    const message = error instanceof Error && /OPENAI_API_KEY|Embedding request/.test(error.message)
      ? 'Curriculum embedding is not configured yet.'
      : 'Could not save curriculum document.'
    return NextResponse.json({ ok: false, code: 'SERVER_ERROR', message }, { status: 500 })
  }
}
