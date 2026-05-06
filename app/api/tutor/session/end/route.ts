import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { finalizeSessionById } from '@/lib/tutor/quota'

type EndReason = 'user' | 'quota' | 'error' | 'unknown'

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
    const endedReason =
      body.endedReason && allowed.includes(body.endedReason) ? body.endedReason : 'user'

    const sql = getNeonSql()
    const result = await finalizeSessionById(sql, userId, sessionId, endedReason)
    if (result.status === 'not_found') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Session not found' }, { status: 404 })
    }

    if (result.status === 'already_ended') {
      return NextResponse.json({
        ok: true,
        alreadyEnded: true,
        appliedSeconds: 0,
        quotaExceededDuringReconcile: false,
        endedReason,
      })
    }

    return NextResponse.json({
      ok: true,
      appliedSeconds: result.appliedSeconds,
      quotaExceededDuringReconcile: result.quotaExceeded,
      endedReason: result.endedReason,
    })
  } catch (e) {
    console.error('[tutor/session/end]', e)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not end session.' },
      { status: 500 }
    )
  }
}
