import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById } from '@/lib/tutor/quota'

type EndReason = 'user' | 'quota' | 'error' | 'unknown' | 'session_limit'

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    let body: { sessionId?: string; endedReason?: EndReason; reconcileDeltaSeconds?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON' }, { status: 400 })
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'sessionId required' }, { status: 400 })
    }

    const allowed: EndReason[] = ['user', 'quota', 'error', 'unknown', 'session_limit']
    const endedReason =
      body.endedReason && allowed.includes(body.endedReason) ? body.endedReason : 'user'

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'session-end',
      userId,
      sessionId,
      maxHits: 120,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many end-session requests.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const result = await finalizeSessionById(sql, userId, sessionId, endedReason)
    if (result.status === 'not_found') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }

    if (result.status === 'already_ended') {
      return NextResponse.json({
        ok: true,
        alreadyEnded: true,
        appliedSeconds: 0,
        quotaExceededDuringReconcile: false,
        endedReason,
      })
    }

    return NextResponse.json({
      ok: true,
      appliedSeconds: result.appliedSeconds,
      quotaExceededDuringReconcile: result.quotaExceeded,
      endedReason: result.endedReason,
    })
  } catch (e) {
    console.error('[tutor/session/end]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not end session.' },
      { status: 500 }
    )
  }
}
