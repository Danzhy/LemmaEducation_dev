import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { claimGuardianAccessCode } from '@/lib/school/access'
import { getCurrentUserProfile } from '@/lib/school/profiles'
import {
  schoolRateLimitResponse,
  takeSchoolWorkflowRateLimit,
} from '@/lib/school/workflow-rate-limit'

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const profile = await getCurrentUserProfile()
    if (profile?.role !== 'parent' && profile?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only parents can use a student access code.' },
        { status: 403 }
      )
    }

    const rateLimit = await takeSchoolWorkflowRateLimit(request, {
      endpoint: 'student-access-code-claim',
      userId: user.id,
      maxHits: 30,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        schoolRateLimitResponse('Too many access-code attempts. Please try again later.', rateLimit.retryAfterSeconds),
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let body: { code?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' }, { status: 400 })
    }

    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Enter a student access code.' },
        { status: 400 }
      )
    }

    const result = await claimGuardianAccessCode({
      guardianUserId: user.id,
      code,
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: 'That student access code is not valid.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, studentUserId: result.studentUserId })
  } catch (error) {
    console.error('[student-access-codes/claim]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not link student.' },
      { status: 500 }
    )
  }
}
