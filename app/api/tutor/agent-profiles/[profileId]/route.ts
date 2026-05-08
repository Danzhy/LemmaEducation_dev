import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { getCurrentUserProfile } from '@/lib/school/profiles'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const profile = await getCurrentUserProfile()
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Only teachers can archive tutor profiles.' }, { status: 403 })
    }

    const { profileId } = await params
    if (!UUID_PATTERN.test(profileId)) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid profile id.' }, { status: 400 })
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'agent-profile-archive',
      userId: user.id,
      maxHits: 60,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many profile changes.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const rows = await sql`
      UPDATE tutor_agent_profiles
      SET status = 'archived', updated_at = NOW()
      WHERE id = ${profileId}::uuid
        AND owner_user_id = ${user.id}
      RETURNING id
    `

    if (!rows[0]) {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Profile not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[tutor/agent-profiles DELETE]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not archive tutor profile.' },
      { status: 500 }
    )
  }
}
