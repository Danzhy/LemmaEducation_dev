import { NextResponse } from 'next/server'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { recordSessionAccessAudit } from '@/lib/school/access'
import {
  getAccessibleTutorSessionDetail,
  getTutorSessionOwnerUserId,
  isTutorSessionId,
} from '@/lib/tutor/history'
import { buildSessionReviewFilename, buildSessionReviewMarkdown } from '@/lib/tutor/session-review-export'
import { getSessionUserId } from '@/lib/tutor/session-user'
import {
  schoolRateLimitResponse,
  takeSchoolWorkflowRateLimit,
} from '@/lib/school/workflow-rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
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
        { ok: false, code: 'FORBIDDEN', message: 'Complete onboarding before exporting sessions.' },
        { status: 403 }
      )
    }

    const rateLimit = await takeSchoolWorkflowRateLimit(request, {
      endpoint: 'session-review-export',
      userId,
      maxHits: 60,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        schoolRateLimitResponse('Too many session exports. Please try again later.', rateLimit.retryAfterSeconds),
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const { sessionId } = await params
    if (!isTutorSessionId(sessionId)) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Invalid session id.' },
        { status: 400 }
      )
    }

    const ownerUserId = await getTutorSessionOwnerUserId(sessionId)
    const session = await getAccessibleTutorSessionDetail(userId, sessionId)
    if (!session || !ownerUserId) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Session not found.' },
        { status: 404 }
      )
    }

    if (
      ownerUserId !== userId &&
      (profile.role === 'teacher' || profile.role === 'parent' || profile.role === 'admin')
    ) {
      await recordSessionAccessAudit({
        sessionId,
        studentUserId: ownerUserId,
        viewerUserId: userId,
        viewerRole: profile.role,
      })
    }

    return new NextResponse(buildSessionReviewMarkdown(session), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${buildSessionReviewFilename(sessionId)}"`,
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    })
  } catch {
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not export this session.' },
      { status: 500 }
    )
  }
}
