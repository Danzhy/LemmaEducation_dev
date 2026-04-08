import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { ensureTutorUsageRow } from '@/lib/tutor/ensure-usage'

const MAX_DELTA_PER_TICK = 120

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
    const rawDelta =
      typeof body.activeDeltaSeconds === 'number' && Number.isFinite(body.activeDeltaSeconds)
        ? Math.floor(body.activeDeltaSeconds)
        : NaN

    if (!sessionId || rawDelta < 1) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'sessionId and positive activeDeltaSeconds required' },
        { status: 400 }
      )
    }

    const delta = Math.min(rawDelta, MAX_DELTA_PER_TICK)
    const sql = getNeonSql()

    const sessionRows = await sql`
      SELECT id, ended_at
      FROM tutor_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
      LIMIT 1
    `
    const sess = sessionRows[0] as { id: string; ended_at: Date | null } | undefined
    if (!sess) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }
    if (sess.ended_at) {
      return NextResponse.json({ ok: false, code: 'SESSION_ENDED', message: 'Session already ended' }, { status: 400 })
    }

    await ensureTutorUsageRow(userId)

    const usageRows = await sql`
      SELECT COALESCE(total_active_seconds, 0)::bigint AS total
      FROM tutor_usage
      WHERE user_id = ${userId}
    `
    const totalBefore = Number((usageRows[0] as { total: string | bigint } | undefined)?.total ?? 0)

    if (totalBefore >= TUTOR_QUOTA_SECONDS) {
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

    const remaining = TUTOR_QUOTA_SECONDS - totalBefore
    const apply = Math.min(delta, remaining)

    if (apply <= 0) {
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

    await sql`
      UPDATE tutor_sessions
      SET active_seconds = active_seconds + ${apply}
      WHERE id = ${sessionId}::uuid AND user_id = ${userId} AND ended_at IS NULL
    `

    await sql`
      UPDATE tutor_usage
      SET total_active_seconds = total_active_seconds + ${apply}, updated_at = NOW()
      WHERE user_id = ${userId}
    `

    const newTotal = totalBefore + apply

    return NextResponse.json({
      ok: true,
      appliedSeconds: apply,
      totalActiveSeconds: newTotal,
      remainingSeconds: Math.max(0, TUTOR_QUOTA_SECONDS - newTotal),
      quotaSeconds: TUTOR_QUOTA_SECONDS,
    })
  } catch (e) {
    console.error('[tutor/usage/tick]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not update usage.' },
      { status: 500 }
    )
  }
}
