import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { createOrRotateStudentAccessCode, getCurrentUserProfile } from '@/lib/school/profiles'

export async function POST() {
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
