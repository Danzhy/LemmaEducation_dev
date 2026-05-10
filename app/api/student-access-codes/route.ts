import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { createOrRotateStudentAccessCode, getCurrentUserProfile } from '@/lib/school/profiles'
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
    if (profile?.role !== 'student' && profile?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only students can create a parent access code.' },
        { status: 403 }
      )
    }

    const rateLimit = await takeSchoolWorkflowRateLimit(request, {
      endpoint: 'student-access-code-create',
      userId: user.id,
      maxHits: 12,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        schoolRateLimitResponse('Too many access-code requests. Please try again later.', rateLimit.retryAfterSeconds),
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const code = await createOrRotateStudentAccessCode(user.id)
    return NextResponse.json({ ok: true, code })
  } catch (error) {
    console.error('[student-access-codes]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not create access code.' },
      { status: 500 }
    )
  }
}
