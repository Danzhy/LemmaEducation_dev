import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getLearnerContextForUser } from '@/lib/tutor/learner-context'
import { getTutorSessionOwnerUserId, isTutorSessionId } from '@/lib/tutor/history'

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { sessionId?: unknown; reason?: unknown } | null
    const sessionId = parseString(body?.sessionId, 80)
    const reason = parseString(body?.reason, 240)
    if (sessionId && !isTutorSessionId(sessionId)) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid session id.' }, { status: 400 })
    }

    if (sessionId) {
      const ownerUserId = await getTutorSessionOwnerUserId(sessionId)
      if (ownerUserId !== user.id) {
        return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Session is not yours.' }, { status: 403 })
      }
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'learner-context',
      userId: user.id,
      sessionId: sessionId || undefined,
      maxHits: 80,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many learner-context checks.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const context = await getLearnerContextForUser({
      userId: user.id,
      sessionId: sessionId || null,
    })

    return NextResponse.json({
      ...context,
      reason,
    })
  } catch (error) {
    console.error('[tutor/learner-context]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not load learner context.' },
      { status: 500 }
    )
  }
}
