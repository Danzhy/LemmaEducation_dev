import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_MESSAGE_MAX_CHARS } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'

const ALLOWED_SOURCES = new Set(['text', 'text_with_image', 'image_only', 'assistant'])

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    let body: { sessionId?: string; role?: string; content?: string; source?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON' }, { status: 400 })
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const role = body.role === 'user' || body.role === 'assistant' ? body.role : null
    const content =
      typeof body.content === 'string' ? body.content.slice(0, TUTOR_MESSAGE_MAX_CHARS) : ''
    const source =
      typeof body.source === 'string' && ALLOWED_SOURCES.has(body.source) ? body.source : null

    if (!sessionId || !role || !content.trim()) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'sessionId, role, and content required' },
        { status: 400 }
      )
    }

    const sql = getNeonSql()

    const sessionRows = await sql`
      SELECT id, user_id, ended_at
      FROM tutor_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
      LIMIT 1
    `
    const sess = sessionRows[0] as { id: string; user_id: string; ended_at: Date | null } | undefined
    if (!sess) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }
    if (sess.ended_at) {
      return NextResponse.json({ ok: false, code: 'SESSION_ENDED', message: 'Session ended' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO tutor_messages (id, session_id, user_id, role, content, source)
      VALUES (${id}::uuid, ${sessionId}::uuid, ${userId}, ${role}, ${content}, ${source})
    `

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[tutor/log-message]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not save message.' },
      { status: 500 }
    )
  }
}
