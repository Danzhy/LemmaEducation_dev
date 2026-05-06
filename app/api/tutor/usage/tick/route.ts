import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById, getOpenSessionById, getPersistedUsageTotal } from '@/lib/tutor/quota'

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    let body: { sessionId?: string; activeDeltaSeconds?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON' }, { status: 400 })
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'sessionId required' },
        { status: 400 }
      )
    }

    const sql = getNeonSql()

    const session = await getOpenSessionById(sql, userId, sessionId)
    if (!session) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }
    if (session.ended_at) {
      return NextResponse.json({ ok: false, code: 'SESSION_ENDED', message: 'Session already ended' }, { status: 400 })
    }

    const persistedActiveSeconds = await getPersistedUsageTotal(sql, userId)
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
    )
    const totalActiveSeconds = Math.min(
      TUTOR_QUOTA_SECONDS,
      persistedActiveSeconds + elapsedSeconds
    )
    const remainingSeconds = Math.max(0, TUTOR_QUOTA_SECONDS - totalActiveSeconds)

    if (remainingSeconds <= 0) {
      await finalizeSessionById(sql, userId, sessionId, 'quota')
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          quotaExceeded: true,
          message: 'Your tutoring time limit has been reached.',
          remainingSeconds: 0,
          quotaSeconds: TUTOR_QUOTA_SECONDS,
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      ok: true,
      appliedSeconds: 0,
      totalActiveSeconds,
      remainingSeconds,
      quotaSeconds: TUTOR_QUOTA_SECONDS,
      sessionActiveSeconds: elapsedSeconds,
    })
  } catch (e) {
    console.error('[tutor/usage/tick]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not update usage.' },
      { status: 500 }
    )
  }
}
