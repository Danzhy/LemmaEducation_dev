import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_INACTIVITY_PAUSE_SECONDS, TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import {
  finalizeSessionById,
  getOpenSessionById,
  getQuotaSnapshot,
  pauseSessionById,
} from '@/lib/tutor/quota'

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
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'usage-tick',
      userId,
      sessionId,
      maxHits: 720,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many tutor activity checks.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const session = await getOpenSessionById(sql, userId, sessionId)
    if (!session) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }
    if (session.ended_at) {
      return NextResponse.json({ ok: false, code: 'SESSION_ENDED', message: 'Session already ended' }, { status: 400 })
    }

    let quota = await getQuotaSnapshot(sql, userId)

    if (
      quota.activeSessionId === sessionId &&
      quota.activeSessionState === 'active' &&
      quota.inactivitySeconds >= TUTOR_INACTIVITY_PAUSE_SECONDS
    ) {
      await pauseSessionById(sql, userId, sessionId)
      quota = await getQuotaSnapshot(sql, userId)
      return NextResponse.json({
        ok: true,
        paused: true,
        inactivityPaused: true,
        totalActiveSeconds: quota.totalActiveSeconds,
        remainingSeconds: quota.remainingSeconds,
        quotaSeconds: quota.quotaSeconds,
        sessionActiveSeconds: quota.activeSessionSeconds,
      })
    }

    if (
      quota.activeSessionId === sessionId &&
      quota.activeSessionState === 'active' &&
      (quota.remainingSeconds <= 0 || quota.activeSessionSeconds >= quota.maxSessionSeconds)
    ) {
      const endedReason =
        quota.activeSessionSeconds >= quota.maxSessionSeconds ? 'session_limit' : 'quota'
      await finalizeSessionById(sql, userId, sessionId, endedReason)
      return NextResponse.json(
        {
          ok: false,
          code: endedReason === 'session_limit' ? 'SESSION_LIMIT_REACHED' : 'QUOTA_EXCEEDED',
          quotaExceeded: endedReason === 'quota',
          sessionLimitReached: endedReason === 'session_limit',
          message:
            endedReason === 'session_limit'
              ? 'This tutoring session reached its 1 hour limit.'
              : 'Your tutoring time limit has been reached.',
          remainingSeconds: 0,
          quotaSeconds: TUTOR_QUOTA_SECONDS,
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      ok: true,
      paused: quota.activeSessionState === 'paused',
      totalActiveSeconds: quota.totalActiveSeconds,
      remainingSeconds: quota.remainingSeconds,
      quotaSeconds: quota.quotaSeconds,
      sessionActiveSeconds: quota.activeSessionSeconds,
    })
  } catch (e) {
    console.error('[tutor/usage/tick]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not update usage.' },
      { status: 500 }
    )
  }
}
