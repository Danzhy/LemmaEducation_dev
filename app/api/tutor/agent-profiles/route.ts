import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { getCurrentUserProfile } from '@/lib/school/profiles'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

async function teacherOwnsClassroom(input: {
  sql: ReturnType<typeof getNeonSql>
  teacherUserId: string
  classroomId: string
}) {
  const rows = await input.sql`
    SELECT id
    FROM classrooms
    WHERE id = ${input.classroomId}::uuid
      AND teacher_user_id = ${input.teacherUserId}
      AND archived_at IS NULL
    LIMIT 1
  `
  return Boolean(rows[0])
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const profile = await getCurrentUserProfile()
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Only teachers can manage tutor profiles.' }, { status: 403 })
    }

    const sql = getNeonSql()
    const rows = await sql`
      SELECT id, classroom_id, name, grade_band, instructions, scope, status, created_at, updated_at
      FROM tutor_agent_profiles
      WHERE owner_user_id = ${user.id}
        AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 50
    `

    return NextResponse.json({ ok: true, profiles: rows })
  } catch (error) {
    console.error('[tutor/agent-profiles GET]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not load tutor profiles.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const profile = await getCurrentUserProfile()
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Only teachers can create tutor profiles.' }, { status: 403 })
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'agent-profile',
      userId: user.id,
      maxHits: 40,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many profile changes.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json().catch(() => null)) as {
      name?: unknown
      instructions?: unknown
      classroomId?: unknown
      gradeBand?: unknown
      scope?: unknown
    } | null

    const name = parseString(body?.name, 120)
    const instructions = parseString(body?.instructions, 4000)
    const classroomId = parseString(body?.classroomId, 80)
    const gradeBand = parseString(body?.gradeBand, 80) || null
    const scope = body?.scope === 'teacher_private' ? 'teacher_private' : 'classroom'

    if (name.length < 2) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Use a clear tutor profile name.' }, { status: 400 })
    }
    if (instructions.length < 20) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Add specific tutor instructions.' }, { status: 400 })
    }
    if (classroomId && !UUID_PATTERN.test(classroomId)) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid classroom id.' }, { status: 400 })
    }
    if (scope === 'classroom' && !classroomId) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Classroom profiles need a classroom.' }, { status: 400 })
    }
    if (classroomId) {
      const allowed = await teacherOwnsClassroom({ sql, teacherUserId: user.id, classroomId })
      if (!allowed && profile.role !== 'admin') {
        return NextResponse.json(
          { ok: false, code: 'FORBIDDEN', message: 'You can only attach profiles to your own classes.' },
          { status: 403 }
        )
      }
    }

    const profileId = randomUUID()
    await sql`
      INSERT INTO tutor_agent_profiles (
        id,
        owner_user_id,
        classroom_id,
        name,
        grade_band,
        instructions,
        scope,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${profileId}::uuid,
        ${user.id},
        ${classroomId || null}::uuid,
        ${name},
        ${gradeBand},
        ${instructions},
        ${scope},
        'active',
        NOW(),
        NOW()
      )
    `

    return NextResponse.json({ ok: true, profileId })
  } catch (error) {
    console.error('[tutor/agent-profiles POST]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not save tutor profile.' },
      { status: 500 }
    )
  }
}
