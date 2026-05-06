import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getQuotaSnapshot, reconcileOpenSessions } from '@/lib/tutor/quota'

function getModelSnapshot() {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-mini'
}

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const sql = getNeonSql()
    await reconcileOpenSessions(sql, userId, 'unknown')
    const quota = await getQuotaSnapshot(sql, userId)

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
    const modelSnapshot = getModelSnapshot()
    let language = 'en'
    let gradeLevel = ''

    try {
      const body = (await request.json()) as { language?: unknown; gradeLevel?: unknown }
      if (typeof body.language === 'string' && body.language.trim()) {
        language = body.language.trim().slice(0, 16)
      }
      if (typeof body.gradeLevel === 'string' && body.gradeLevel.trim()) {
        gradeLevel = body.gradeLevel.trim().slice(0, 40)
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
        grade_level
      )
      VALUES (${sessionId}, ${userId}, NOW(), 0, ${modelSnapshot}, ${language}, ${gradeLevel})
    `

    return NextResponse.json({
      ok: true,
      sessionId,
      remainingSeconds: quota.remainingSeconds,
      quotaSeconds: TUTOR_QUOTA_SECONDS,
    })
  } catch (e) {
    console.error('[tutor/session/start]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not start session. Try again.' },
      { status: 500 }
    )
  }
}
