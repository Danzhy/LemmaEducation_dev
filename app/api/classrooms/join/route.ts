import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { joinClassroomAsStudent } from '@/lib/school/access'
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
    if (profile?.role !== 'student' && profile?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only students can join a class with this code.' },
        { status: 403 }
      )
    }

    const rateLimit = await takeSchoolWorkflowRateLimit(request, {
      endpoint: 'classroom-join',
      userId: user.id,
      maxHits: 30,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        schoolRateLimitResponse('Too many class-code attempts. Please try again later.', rateLimit.retryAfterSeconds),
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let body: { joinCode?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' }, { status: 400 })
    }

    const joinCode = typeof body.joinCode === 'string' ? body.joinCode.trim() : ''
    if (!joinCode) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Enter a classroom code.' },
        { status: 400 }
      )
    }

    const result = await joinClassroomAsStudent({
      studentUserId: user.id,
      joinCode,
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: 'That class code could not be found.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, classroom: result.classroom })
  } catch (error) {
    console.error('[classrooms/join]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not join class.' },
      { status: 500 }
    )
  }
}
