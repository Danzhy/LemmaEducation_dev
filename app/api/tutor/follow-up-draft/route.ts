import { NextResponse } from 'next/server'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { canViewStudentRecords } from '@/lib/school/access'
import { buildFollowUpAssignmentDraft } from '@/lib/tutor/follow-up-draft'
import { buildStudentMisconceptionTrends } from '@/lib/tutor/misconception-trends'
import { getNeonSql } from '@/lib/tutor/db'
import { getSessionUserId } from '@/lib/tutor/session-user'
import {
  schoolRateLimitResponse,
  takeSchoolWorkflowRateLimit,
} from '@/lib/school/workflow-rate-limit'

type RequestBody = {
  studentUserId?: unknown
  focusLabel?: unknown
  gradeLevel?: unknown
}

type TrendRow = {
  event_type: string
  tool_name: string
  status: string | null
  output_json: unknown
  created_at: Date | string | null
}

function readBodyString(body: RequestBody, key: keyof RequestBody, maxLength: number) {
  const value = body[key]
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

async function getRecentFocusLabel(studentUserId: string) {
  const sql = getNeonSql()
  const rows = await sql`
    SELECT event_type, tool_name, status, output_json, created_at
    FROM tutor_tool_events
    WHERE user_id = ${studentUserId}
      AND event_type = 'tool_completed'
      AND tool_name IN (
        'math_check_step',
        'mistake_pattern_classifier',
        'misconception_diagnosis',
        'session_mastery_snapshot'
      )
    ORDER BY created_at DESC
    LIMIT 60
  `

  const trends = buildStudentMisconceptionTrends(
    (rows as TrendRow[]).map((row) => ({
      eventType: row.event_type,
      toolName: row.tool_name,
      status: row.status,
      output: row.output_json,
      createdAt: row.created_at,
    }))
  )

  return trends.focusAreas[0]?.label ?? null
}

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in.' },
        { status: 401 }
      )
    }

    const profile = await getCurrentUserProfile()
    if (!profile || !isOnboardingComplete(profile)) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Complete onboarding first.' },
        { status: 403 }
      )
    }

    if (profile.role !== 'teacher' && profile.role !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Only teachers can draft follow-up work.' },
        { status: 403 }
      )
    }

    const rateLimit = await takeSchoolWorkflowRateLimit(request, {
      endpoint: 'follow-up-draft',
      userId,
      maxHits: 40,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        schoolRateLimitResponse('Too many follow-up drafts. Please try again later.', rateLimit.retryAfterSeconds),
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    let body: RequestBody
    try {
      body = (await request.json()) as RequestBody
    } catch {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' },
        { status: 400 }
      )
    }

    const studentUserId = readBodyString(body, 'studentUserId', 180)
    if (!studentUserId) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Choose a student first.' },
        { status: 400 }
      )
    }

    const allowed = await canViewStudentRecords(userId, studentUserId)
    if (!allowed) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'You do not have access to this student.' },
        { status: 403 }
      )
    }

    const focusLabel = readBodyString(body, 'focusLabel', 120) ?? (await getRecentFocusLabel(studentUserId))
    if (!focusLabel) {
      return NextResponse.json(
        { ok: false, code: 'NO_FOCUS', message: 'No review focus has been saved for this student yet.' },
        { status: 409 }
      )
    }

    const draft = buildFollowUpAssignmentDraft({
      focusLabel,
      gradeLevel: readBodyString(body, 'gradeLevel', 40),
      itemCount: 3,
    })
    if (!draft) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Use a clearer math review focus.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, draft })
  } catch {
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not draft follow-up work.' },
      { status: 500 }
    )
  }
}
