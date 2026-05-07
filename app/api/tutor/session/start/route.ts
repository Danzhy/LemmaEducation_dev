import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import {
  TUTOR_MAX_COMPLETED_SESSIONS,
  TUTOR_MAX_SESSION_SECONDS,
  TUTOR_QUOTA_SECONDS,
} from '@/lib/tutor/constants'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getQuotaSnapshot, reconcileOpenSessions } from '@/lib/tutor/quota'
import { createTutorDbTimeout } from '@/lib/tutor/db-timeout'

function getModelSnapshot() {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-mini'
}

export async function POST(request: Request) {
  const dbTimeout = createTutorDbTimeout()
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const sql = getNeonSql({ signal: dbTimeout.signal })

    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'session-start',
      userId,
      maxHits: 24,
      windowSeconds: 60 * 60,
      sql,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many session starts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    await reconcileOpenSessions(sql, userId, 'unknown')
    const quota = await getQuotaSnapshot(sql, userId)

    if (quota.remainingSessionCount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SESSION_LIMIT_REACHED',
          message: 'You have used all 4 pilot tutoring sessions.',
          remainingSessionCount: 0,
          maxCompletedSessions: TUTOR_MAX_COMPLETED_SESSIONS,
        },
        { status: 403 }
      )
    }

    if (quota.remainingSeconds <= 0) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          message: 'Your tutoring time limit has been reached.',
          remainingSeconds: 0,
          quotaSeconds: TUTOR_QUOTA_SECONDS,
        },
        { status: 403 }
      )
    }

    const sessionId = randomUUID()
    let language = 'en'
    let gradeLevel = ''
    let modelSnapshot = getModelSnapshot()

    try {
      const body = (await request.json()) as {
        language?: unknown
        gradeLevel?: unknown
        modelSnapshot?: unknown
      }
      if (typeof body.language === 'string' && body.language.trim()) {
        language = body.language.trim().slice(0, 16)
      }
      if (typeof body.gradeLevel === 'string' && body.gradeLevel.trim()) {
        gradeLevel = body.gradeLevel.trim().slice(0, 40)
      }
      if (typeof body.modelSnapshot === 'string' && body.modelSnapshot.trim()) {
        modelSnapshot = body.modelSnapshot.trim().slice(0, 80)
      }
    } catch {
      // Empty body is allowed; defaults above remain.
    }

    await sql`
      INSERT INTO tutor_sessions (
        id,
        user_id,
        started_at,
        active_seconds,
        model_snapshot,
        language,
        grade_level,
        session_state,
        last_resumed_at,
        last_activity_at
      )
      VALUES (
        ${sessionId},
        ${userId},
        NOW(),
        0,
        ${modelSnapshot},
        ${language},
        ${gradeLevel},
        'active',
        NOW(),
        NOW()
      )
    `

    return NextResponse.json({
      ok: true,
      sessionId,
      remainingSeconds: quota.remainingSeconds,
      quotaSeconds: TUTOR_QUOTA_SECONDS,
      remainingSessionCount: quota.remainingSessionCount - 1,
      maxCompletedSessions: TUTOR_MAX_COMPLETED_SESSIONS,
      maxSessionSeconds: TUTOR_MAX_SESSION_SECONDS,
    })
  } catch (e) {
    const databaseTimedOut = dbTimeout.timedOut()
    console.error('[tutor/session/start]', e)
    return NextResponse.json(
      {
        ok: false,
        code: databaseTimedOut ? 'DATABASE_TIMEOUT' : 'SERVER_ERROR',
        message:
          databaseTimedOut
            ? 'Could not reach the session database quickly enough. Please try again.'
            : 'Could not start session. Try again.',
      },
      { status: databaseTimedOut ? 503 : 500 }
    )
  } finally {
    dbTimeout.clear()
  }
}
