import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById, getQuotaSnapshot, pauseSessionById } from '@/lib/tutor/quota'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'

export async function GET(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'quota',
      userId,
      maxHits: 360,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many quota checks.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let quota = await getQuotaSnapshot(sql, userId)
    if (
      quota.activeSessionId &&
      quota.activeSessionState === 'active' &&
      quota.inactivitySeconds >= TUTOR_INACTIVITY_PAUSE_SECONDS
    ) {
      await pauseSessionById(sql, userId, quota.activeSessionId)
      quota = await getQuotaSnapshot(sql, userId)
    }

    if (
      quota.activeSessionId &&
      quota.activeSessionState === 'active' &&
      (quota.remainingSeconds <= 0 || quota.activeSessionSeconds >= quota.maxSessionSeconds)
    ) {
      await finalizeSessionById(
        sql,
        userId,
        quota.activeSessionId,
        quota.remainingSeconds <= 0 ? 'quota' : 'session_limit'
      )
      quota = await getQuotaSnapshot(sql, userId)
    }

    return NextResponse.json({
      ok: true,
      totalActiveSeconds: quota.totalActiveSeconds,
      weeklyActiveSeconds: quota.weeklyActiveSeconds,
      lifetimeActiveSeconds: quota.lifetimeActiveSeconds,
      remainingSeconds: quota.remainingSeconds,
      quotaSeconds: quota.quotaSeconds,
      quotaPeriod: quota.quotaPeriod,
      quotaPeriodStartedAt: quota.quotaPeriodStartedAt,
      activeSessionId: quota.activeSessionId,
      activeSessionState: quota.activeSessionState,
      activeSessionSeconds: quota.activeSessionSeconds,
      remainingSessionCount: quota.remainingSessionCount,
      maxCompletedSessions: quota.maxCompletedSessions,
      maxSessionSeconds: quota.maxSessionSeconds,
    })
  } catch (e) {
    console.error('[tutor/quota]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not load quota. Try again.' },
      { status: 500 }
    )
  }
}
