import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { createClassroomForTeacher } from '@/lib/school/access'
import { getCurrentUserProfile } from '@/lib/school/profiles'

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
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only teachers can create classes.' },
        { status: 403 }
      )
    }

    let body: { name?: string; gradeLabel?: string; schoolName?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const gradeLabel = typeof body.gradeLabel === 'string' ? body.gradeLabel.trim() : ''
    const schoolName = typeof body.schoolName === 'string' ? body.schoolName.trim() : ''

    if (name.length < 2 || name.length > 120) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Use a class name between 2 and 120 characters.' },
        { status: 400 }
      )
    }

    const result = await createClassroomForTeacher({
      teacherUserId: user.id,
      name,
      gradeLabel,
      schoolName,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[classrooms]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not create class.' },
      { status: 500 }
    )
  }
}
