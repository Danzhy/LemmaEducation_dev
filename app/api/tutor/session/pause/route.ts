import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { pauseSessionById } from '@/lib/tutor/quota'

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
      endpoint: 'session-pause',
      userId,
      sessionId,
      maxHits: 240,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many pause requests.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const sql = getNeonSql()
    const result = await pauseSessionById(sql, userId, sessionId)

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

    return NextResponse.json({
      ok: true,
      paused: true,
      alreadyPaused: result.status === 'already_paused',
      sessionActiveSeconds: 'activeSeconds' in result ? result.activeSeconds : 0,
    })
  } catch (error) {
    console.error('[tutor/session/pause]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not pause session.' },
      { status: 500 }
    )
  }
}
