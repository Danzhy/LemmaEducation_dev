import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { ensureTutorUsageRow } from '@/lib/tutor/ensure-usage'

export async function GET() {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const sql = getNeonSql()
    await ensureTutorUsageRow(userId)
    const rows = await sql`
      SELECT COALESCE(total_active_seconds, 0)::bigint AS total
      FROM tutor_usage
      WHERE user_id = ${userId}
    `
    const total = Number((rows[0] as { total: string | bigint } | undefined)?.total ?? 0)
    const remainingSeconds = Math.max(0, TUTOR_QUOTA_SECONDS - total)

    return NextResponse.json({
      ok: true,
      totalActiveSeconds: total,
      remainingSeconds,
      quotaSeconds: TUTOR_QUOTA_SECONDS,
    })
  } catch (e) {
    console.error('[tutor/quota]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not load quota. Try again.' },
      { status: 500 }
    )
  }
}
