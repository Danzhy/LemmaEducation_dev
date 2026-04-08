import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'

function getModelSnapshot() {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-mini'
}

export async function POST() {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const sql = getNeonSql()

    await sql`
      UPDATE tutor_sessions
      SET ended_at = NOW(), ended_reason = 'unknown'
      WHERE user_id = ${userId} AND ended_at IS NULL
    `

    await sql`
      INSERT INTO tutor_usage (user_id, total_active_seconds, updated_at)
      VALUES (${userId}, 0, NOW())
      ON CONFLICT (user_id) DO NOTHING
    `

    const usageRows = await sql`
      SELECT total_active_seconds::bigint AS total
      FROM tutor_usage
      WHERE user_id = ${userId}
    `
    const total = Number((usageRows[0] as { total: string | bigint } | undefined)?.total ?? 0)

    if (total >= TUTOR_QUOTA_SECONDS) {
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

    await sql`
      INSERT INTO tutor_sessions (id, user_id, started_at, active_seconds, model_snapshot)
      VALUES (${sessionId}, ${userId}, NOW(), 0, ${modelSnapshot})
    `

    return NextResponse.json({
      ok: true,
      sessionId,
      remainingSeconds: Math.max(0, TUTOR_QUOTA_SECONDS - total),
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
