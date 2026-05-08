import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { searchCurriculumForUser } from '@/lib/curriculum/search'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'curriculum-search',
      userId: user.id,
      maxHits: 180,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many curriculum searches.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const body = (await request.json().catch(() => null)) as {
      query?: unknown
      classroomId?: unknown
      limit?: unknown
    } | null

    const query = parseString(body?.query, 500)
    const classroomId = parseString(body?.classroomId, 80)
    const limit = typeof body?.limit === 'number' ? body.limit : undefined

    if (query.length < 2) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Search needs a short math topic or question.' }, { status: 400 })
    }
    if (classroomId && !UUID_PATTERN.test(classroomId)) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid classroom id.' }, { status: 400 })
    }

    const result = await searchCurriculumForUser({
      userId: user.id,
      query,
      classroomId: classroomId || null,
      limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[curriculum/search]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not search curriculum context.' },
      { status: 500 }
    )
  }
}
