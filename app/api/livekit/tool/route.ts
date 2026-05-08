import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getQuotaSnapshot } from '@/lib/tutor/quota'
import { createTutorDbTimeout } from '@/lib/tutor/db-timeout'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import { runLiveKitTutorToolWithMetrics } from '@/lib/livekit/tool-runner'
import { LIVEKIT_TUTOR_TOOL_NAMES } from '@/lib/livekit/tool-catalog'

const MAX_TOOL_INPUT_BYTES = 12_000
const MAX_CANVAS_ACTIONS_PER_RESULT = 80

function parseString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : ''
}

function inputIsTooLarge(input: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(input ?? {})).length > MAX_TOOL_INPUT_BYTES
  } catch {
    return true
  }
}

export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' },
      { status: 401 }
    )
  }

  let sessionId = ''
  let toolName = ''
  let input: unknown = {}

  try {
    const body = (await request.json()) as {
      sessionId?: unknown
      toolName?: unknown
      input?: unknown
    }
    sessionId = parseString(body.sessionId, 80)
    toolName = parseString(body.toolName, 120)
    input = body.input ?? {}
  } catch {
    return NextResponse.json(
      { ok: false, code: 'INVALID_JSON', message: 'Tool request must be valid JSON.' },
      { status: 400 }
    )
  }

  if (!sessionId || !toolName) {
    return NextResponse.json(
      { ok: false, code: 'MISSING_FIELDS', message: 'sessionId and toolName are required.' },
      { status: 400 }
    )
  }

  if (!LIVEKIT_TUTOR_TOOL_NAMES.includes(toolName as (typeof LIVEKIT_TUTOR_TOOL_NAMES)[number])) {
    return NextResponse.json(
      { ok: false, code: 'UNSUPPORTED_TOOL', message: 'That LiveKit tutor tool is not supported.' },
      { status: 400 }
    )
  }

  if (inputIsTooLarge(input)) {
    return NextResponse.json(
      { ok: false, code: 'TOOL_INPUT_TOO_LARGE', message: 'Tool input is too large.' },
      { status: 413 }
    )
  }

  const dbTimeout = createTutorDbTimeout()
  try {
    const sql = getNeonSql({ signal: dbTimeout.signal })
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'livekit-tool',
      userId,
      sessionId,
      maxHits: 240,
      windowSeconds: 60 * 60,
      sql,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many LiveKit tool calls.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const quota = await getQuotaSnapshot(sql, userId)
    if (!quota.activeSessionId || quota.activeSessionId !== sessionId || quota.activeSessionState !== 'active') {
      return NextResponse.json(
        { ok: false, code: 'SESSION_REQUIRED', message: 'Start an active tutor session first.' },
        { status: 409 }
      )
    }

    if (quota.remainingSeconds <= 0) {
      return NextResponse.json(
        { ok: false, code: 'QUOTA_EXCEEDED', message: 'Tutoring time limit reached.' },
        { status: 429 }
      )
    }
  } catch (error) {
    const databaseTimedOut = dbTimeout.timedOut()
    console.error('[livekit/tool] quota check', error)
    return NextResponse.json(
      {
        ok: false,
        code: databaseTimedOut ? 'DATABASE_TIMEOUT' : 'QUOTA_CHECK_FAILED',
        message: databaseTimedOut
          ? 'Could not reach the session database quickly enough. Please try again.'
          : 'Could not verify the tutor session.',
      },
      { status: 503 }
    )
  } finally {
    dbTimeout.clear()
  }

  try {
    const { output, metrics } = await runLiveKitTutorToolWithMetrics(toolName, input)
    const canvasActions = extractCanvasActionsFromToolResult(
      toolName,
      output,
      MAX_CANVAS_ACTIONS_PER_RESULT
    )
    return NextResponse.json({
      ok: true,
      output,
      canvasActions,
      toolMeta: {
        toolName,
        ...metrics,
        canvasActionCount: canvasActions.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool failed.'
    return NextResponse.json({ ok: false, code: 'TOOL_FAILED', message }, { status: 400 })
  }
}
