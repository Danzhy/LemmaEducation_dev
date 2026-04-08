import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_QUOTA_SECONDS, TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { ensureTutorUsageRow } from '@/lib/tutor/ensure-usage'

type EndReason = 'user' | 'quota' | 'error' | 'unknown'

const CHUNK_SECONDS = 120

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

    const allowed: EndReason[] = ['user', 'quota', 'error', 'unknown']
    let endedReason =
      body.endedReason && allowed.includes(body.endedReason) ? body.endedReason : 'user'

    const rawReconcile =
      typeof body.reconcileDeltaSeconds === 'number' && Number.isFinite(body.reconcileDeltaSeconds)
        ? Math.floor(body.reconcileDeltaSeconds)
        : 0
    let remainingToApply = Math.min(Math.max(0, rawReconcile), TUTOR_RECONCILE_MAX_SECONDS_PER_REQUEST)

    const sql = getNeonSql()

    const existing = await sql`
      SELECT id, ended_at
      FROM tutor_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
      LIMIT 1
    `

    const row = existing[0] as { id: string; ended_at: Date | null } | undefined
    if (!row) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }

    if (row.ended_at) {
      let appliedSeconds = 0
      let quotaExceededDuringReconcile = false
      await ensureTutorUsageRow(userId)
      while (remainingToApply > 0) {
        const chunk = Math.min(remainingToApply, CHUNK_SECONDS)
        const usageRows = await sql`
          SELECT COALESCE(total_active_seconds, 0)::bigint AS total
          FROM tutor_usage
          WHERE user_id = ${userId}
        `
        const totalBefore = Number((usageRows[0] as { total: string | bigint } | undefined)?.total ?? 0)
        if (totalBefore >= TUTOR_QUOTA_SECONDS) {
          quotaExceededDuringReconcile = true
          break
        }
        const apply = Math.min(chunk, Math.max(0, TUTOR_QUOTA_SECONDS - totalBefore))
        if (apply <= 0) break
        await sql`
          UPDATE tutor_usage
          SET total_active_seconds = total_active_seconds + ${apply}, updated_at = NOW()
          WHERE user_id = ${userId}
        `
        appliedSeconds += apply
        remainingToApply -= apply
        if (totalBefore + apply >= TUTOR_QUOTA_SECONDS) {
          quotaExceededDuringReconcile = true
          break
        }
      }
      return NextResponse.json({
        ok: true,
        alreadyEnded: true,
        appliedSeconds,
        quotaExceededDuringReconcile,
      })
    }

    let appliedSeconds = 0
    let quotaExceededDuringReconcile = false

    await ensureTutorUsageRow(userId)

    while (remainingToApply > 0) {
      const chunk = Math.min(remainingToApply, CHUNK_SECONDS)
      const usageRows = await sql`
        SELECT COALESCE(total_active_seconds, 0)::bigint AS total
        FROM tutor_usage
        WHERE user_id = ${userId}
      `
      const totalBefore = Number((usageRows[0] as { total: string | bigint } | undefined)?.total ?? 0)

      if (totalBefore >= TUTOR_QUOTA_SECONDS) {
        quotaExceededDuringReconcile = true
        endedReason = 'quota'
        break
      }

      const apply = Math.min(chunk, Math.max(0, TUTOR_QUOTA_SECONDS - totalBefore))
      if (apply <= 0) break

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

      appliedSeconds += apply
      remainingToApply -= apply

      if (totalBefore + apply >= TUTOR_QUOTA_SECONDS) {
        quotaExceededDuringReconcile = true
        if (endedReason === 'user') endedReason = 'quota'
        break
      }
    }

    await sql`
      UPDATE tutor_sessions
      SET ended_at = NOW(), ended_reason = ${endedReason}
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
    `

    return NextResponse.json({
      ok: true,
      appliedSeconds,
      quotaExceededDuringReconcile,
      endedReason,
    })
  } catch (e) {
    console.error('[tutor/session/end]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not end session.' },
      { status: 500 }
    )
  }
}
