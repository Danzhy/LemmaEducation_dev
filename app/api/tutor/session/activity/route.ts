import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { touchSessionActivity } from '@/lib/tutor/quota'

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
      endpoint: 'session-activity',
      userId,
      sessionId,
      maxHits: 720,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many session activity updates.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const sql = getNeonSql()
    const touched = await touchSessionActivity(sql, userId, sessionId)
    if (!touched) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Session not found.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[tutor/session/activity]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not update session activity.' },
      { status: 500 }
    )
  }
}
