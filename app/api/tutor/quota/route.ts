import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById, getQuotaSnapshot } from '@/lib/tutor/quota'

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
    let quota = await getQuotaSnapshot(sql, userId)
    if (quota.activeSessionId && quota.remainingSeconds <= 0) {
      await finalizeSessionById(sql, userId, quota.activeSessionId, 'quota')
      quota = await getQuotaSnapshot(sql, userId)
    }

    return NextResponse.json({
      ok: true,
      totalActiveSeconds: quota.totalActiveSeconds,
      remainingSeconds: quota.remainingSeconds,
      quotaSeconds: quota.quotaSeconds,
      activeSessionId: quota.activeSessionId,
    })
  } catch (e) {
    console.error('[tutor/quota]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not load quota. Try again.' },
      { status: 500 }
    )
  }
}
