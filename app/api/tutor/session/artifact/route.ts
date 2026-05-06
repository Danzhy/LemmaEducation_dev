import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { TUTOR_CANVAS_ARTIFACT_MAX_BASE64_CHARS } from '@/lib/tutor/constants'
import { touchSessionActivity } from '@/lib/tutor/quota'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    let body: { sessionId?: string; mimeType?: string; dataBase64?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' },
        { status: 400 }
      )
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : ''
    const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.trim() : ''

    if (!sessionId || !mimeType || !dataBase64) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'sessionId, mimeType, and dataBase64 are required.' },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Unsupported artifact format.' },
        { status: 400 }
      )
    }

    if (dataBase64.length > TUTOR_CANVAS_ARTIFACT_MAX_BASE64_CHARS) {
      return NextResponse.json(
        { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Canvas snapshot is too large to save.' },
        { status: 413 }
      )
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'session-artifact',
      userId,
      sessionId,
      maxHits: 480,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many board snapshots.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const sessionRows = await sql`
      SELECT id
      FROM tutor_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
      LIMIT 1
    `

    if (!sessionRows[0]) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Session not found.' },
        { status: 404 }
      )
    }

    const artifactId = randomUUID()
    const byteSize = Math.floor((dataBase64.length * 3) / 4)

    await sql`
      INSERT INTO tutor_session_artifacts (
        id,
        session_id,
        user_id,
        artifact_kind,
        mime_type,
        data_base64,
        byte_size,
        created_at,
        updated_at
      )
      VALUES (
        ${artifactId}::uuid,
        ${sessionId}::uuid,
        ${userId},
        'canvas_snapshot',
        ${mimeType},
        ${dataBase64},
        ${byteSize},
        NOW(),
        NOW()
      )
      ON CONFLICT (session_id, artifact_kind)
      DO UPDATE SET
        mime_type = EXCLUDED.mime_type,
        data_base64 = EXCLUDED.data_base64,
        byte_size = EXCLUDED.byte_size,
        updated_at = NOW()
    `
    await touchSessionActivity(sql, userId, sessionId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[tutor/session/artifact]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not save canvas snapshot.' },
      { status: 500 }
    )
  }
}
