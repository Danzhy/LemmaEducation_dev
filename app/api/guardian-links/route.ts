import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { unlinkGuardianFromStudent } from '@/lib/school/access'
import { getCurrentUserProfile } from '@/lib/school/profiles'
import { getNeonSql } from '@/lib/tutor/db'
import { takeRateLimit } from '@/lib/request-rate-limit'

function guardianLinkErrorStatus(code: string) {
  switch (code) {
    case 'LINK_NOT_FOUND':
    case 'NOT_FOUND':
      return 404
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'BAD_REQUEST':
    case 'INVALID_INPUT':
      return 400
    default:
      return 500
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const profile = await getCurrentUserProfile()
    if (profile?.role !== 'student' && profile?.role !== 'parent' && profile?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only students, parents, or admins can change guardian links.' },
        { status: 403 }
      )
    }

    let body: { studentUserId?: string; guardianUserId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' }, { status: 400 })
    }

    const studentUserId =
      typeof body.studentUserId === 'string' ? body.studentUserId.trim() : ''
    const guardianUserId =
      typeof body.guardianUserId === 'string' ? body.guardianUserId.trim() : undefined

    if (!studentUserId) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'studentUserId required.' },
        { status: 400 }
      )
    }

    const sql = getNeonSql()
    const rateLimit = await takeRateLimit(sql, {
      endpoint: 'guardian-link-remove',
      subject: `user:${user.id}`,
      maxHits: 120,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many access changes. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const result = await unlinkGuardianFromStudent({
      actorUserId: user.id,
      studentUserId,
      guardianUserId,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          message: 'message' in result && typeof result.message === 'string'
            ? result.message
            : 'That guardian link could not be found.',
        },
        { status: guardianLinkErrorStatus(result.code) }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[guardian-links]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not update guardian access.' },
      { status: 500 }
    )
  }
}
