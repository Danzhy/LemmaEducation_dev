import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { removeStudentFromClassroom } from '@/lib/school/access'
import { getCurrentUserProfile } from '@/lib/school/profiles'
import { getNeonSql } from '@/lib/tutor/db'
import { takeRateLimit } from '@/lib/request-rate-limit'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ classroomId: string; studentUserId: string }> }
) {
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
        { ok: false, code: 'FORBIDDEN', message: 'Only teachers can manage classes.' },
        { status: 403 }
      )
    }

    const sql = getNeonSql()
    const rateLimit = await takeRateLimit(sql, {
      endpoint: 'classroom-roster-remove',
      subject: `user:${user.id}`,
      maxHits: 120,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many roster changes. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const { classroomId, studentUserId } = await params
    const result = await removeStudentFromClassroom({
      teacherUserId: user.id,
      classroomId,
      studentUserId,
    })

    if (!result.ok) {
      const message =
        result.code === 'CLASSROOM_NOT_FOUND'
          ? 'Classroom not found.'
          : 'Student is not in this class.'

      return NextResponse.json(
        { ok: false, code: result.code, message },
        { status: result.code === 'CLASSROOM_NOT_FOUND' ? 404 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[classrooms/:classroomId/students/:studentUserId]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not update the class roster.' },
      { status: 500 }
    )
  }
}
