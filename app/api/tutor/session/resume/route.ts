import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { resumeSessionById } from '@/lib/tutor/quota'

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    let body: { sessionId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' }, { status: 400 })
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'sessionId required' },
        { status: 400 }
      )
    }

    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'session-resume',
      userId,
      sessionId,
      maxHits: 240,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many resume requests.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const sql = getNeonSql()
    const result = await resumeSessionById(sql, userId, sessionId)

    if (result.status === 'not_found') {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Session not found.' },
        { status: 404 }
      )
    }

    if (result.status === 'already_ended') {
      return NextResponse.json(
        { ok: false, code: 'SESSION_ENDED', message: 'Session already ended.' },
        { status: 400 }
      )
    }

    if (result.status === 'quota_exceeded') {
      return NextResponse.json(
        { ok: false, code: 'QUOTA_EXCEEDED', message: 'Your tutoring time limit has been reached.' },
        { status: 403 }
      )
    }

    if (result.status === 'session_limit') {
      return NextResponse.json(
        { ok: false, code: 'SESSION_LIMIT_REACHED', message: 'This tutoring session reached its 1 hour limit.' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      ok: true,
      resumed: true,
      alreadyActive: result.status === 'already_active',
    })
  } catch (error) {
    console.error('[tutor/session/resume]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not resume session.' },
      { status: 500 }
    )
  }
}
