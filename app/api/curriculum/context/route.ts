import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/current-user'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import {
  buildCurriculumContextToolResult,
  getLabTutorCurriculumContextPackForUser,
} from '@/lib/curriculum/context'

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' }, { status: 401 })
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'curriculum-context',
      userId: user.id,
      maxHits: 80,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many curriculum context checks.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const pack = await getLabTutorCurriculumContextPackForUser(user.id)
    return NextResponse.json(buildCurriculumContextToolResult(pack))
  } catch (error) {
    console.error('[curriculum/context]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not load curriculum context.' },
      { status: 500 }
    )
  }
}
