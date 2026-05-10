import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import {
  getUserProfileById,
  isOnboardingComplete,
  saveOnboardingProfile,
  type UserRole,
} from '@/lib/school/profiles'
import { joinClassroomAsStudent, claimGuardianAccessCode } from '@/lib/school/access'
import {
  schoolRateLimitResponse,
  takeSchoolWorkflowRateLimit,
} from '@/lib/school/workflow-rate-limit'

const ALLOWED_ROLES = new Set<UserRole>(['student', 'teacher', 'parent'])
const GRADE_OPTIONS = new Set(['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'])

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const rateLimit = await takeSchoolWorkflowRateLimit(request, {
      endpoint: 'profile-onboarding',
      userId: user.id,
      maxHits: 30,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        schoolRateLimitResponse('Too many onboarding attempts. Please try again later.', rateLimit.retryAfterSeconds),
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let body: {
      role?: string
      displayName?: string
      gradeLevel?: string
      schoolName?: string
      classJoinCode?: string
      studentAccessCode?: string
      privacyAccepted?: boolean
      consentAccepted?: boolean
    }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' }, { status: 400 })
    }

    const role = typeof body.role === 'string' ? (body.role.trim() as UserRole) : null
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const gradeLevel = typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() : ''
    const schoolName = typeof body.schoolName === 'string' ? body.schoolName.trim() : ''
    const classJoinCode = typeof body.classJoinCode === 'string' ? body.classJoinCode.trim() : ''
    const studentAccessCode =
      typeof body.studentAccessCode === 'string' ? body.studentAccessCode.trim() : ''

    if (!role || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Please choose a valid role.' },
        { status: 400 }
      )
    }

    if (displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Use a name between 2 and 80 characters.' },
        { status: 400 }
      )
    }

    if (!body.privacyAccepted || !body.consentAccepted) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Please accept the privacy and pilot data notices.' },
        { status: 400 }
      )
    }

    if (role === 'student' && gradeLevel && !GRADE_OPTIONS.has(gradeLevel)) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Choose a valid grade level.' },
        { status: 400 }
      )
    }

    const existingProfile = await getUserProfileById(user.id)
    if (existingProfile && isOnboardingComplete(existingProfile)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'ROLE_LOCKED',
          message: 'Your role is already set. Contact support if this needs to change.',
        },
        { status: 409 }
      )
    }

    await saveOnboardingProfile({
      user,
      role,
      displayName,
      gradeLevel: role === 'student' ? gradeLevel : undefined,
      schoolName: role === 'teacher' ? schoolName : undefined,
    })

    if (role === 'student' && classJoinCode) {
      const result = await joinClassroomAsStudent({
        studentUserId: user.id,
        joinCode: classJoinCode,
      })

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, code: result.code, message: 'That class code could not be found.' },
          { status: 400 }
        )
      }
    }

    if (role === 'parent' && studentAccessCode) {
      const result = await claimGuardianAccessCode({
        guardianUserId: user.id,
        code: studentAccessCode,
      })

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, code: result.code, message: 'That student access code is not valid.' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[profile/onboarding]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not save onboarding details.' },
      { status: 500 }
    )
  }
}
