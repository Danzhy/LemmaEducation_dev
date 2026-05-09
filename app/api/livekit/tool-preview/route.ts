import { NextRequest, NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getQuotaSnapshot } from '@/lib/tutor/quota'
import { createTutorDbTimeout } from '@/lib/tutor/db-timeout'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import { LIVEKIT_TUTOR_TOOL_NAMES } from '@/lib/livekit/tool-catalog'
import { runLiveKitTutorToolWithMetrics } from '@/lib/livekit/tool-runner'

const MAX_TOOL_INPUT_BYTES = 12_000

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

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

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' }, 401)
  }

  const body = (await request.json().catch(() => null)) as {
    sessionId?: unknown
    toolName?: unknown
    input?: unknown
  } | null

  if (!body) {
    return jsonResponse({ ok: false, code: 'INVALID_JSON', message: 'Tool request must be valid JSON.' }, 400)
  }

  const sessionId = parseString(body.sessionId, 80)
  const toolName = parseString(body.toolName, 120)
  const input = body.input ?? {}

  if (!sessionId || !toolName) {
    return jsonResponse({ ok: false, code: 'MISSING_FIELDS', message: 'sessionId and toolName are required.' }, 400)
  }

  if (!LIVEKIT_TUTOR_TOOL_NAMES.includes(toolName as (typeof LIVEKIT_TUTOR_TOOL_NAMES)[number])) {
    return jsonResponse({ ok: false, code: 'UNSUPPORTED_TOOL', message: 'Unsupported lab tool.' }, 400)
  }

  if (inputIsTooLarge(input)) {
    return jsonResponse({ ok: false, code: 'TOOL_INPUT_TOO_LARGE', message: 'Tool input is too large.' }, 413)
  }

  const dbTimeout = createTutorDbTimeout()
  try {
    const sql = getNeonSql({ signal: dbTimeout.signal })
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'livekit-tool-preview',
      userId,
      sessionId,
      maxHits: 120,
      windowSeconds: 60 * 60,
      sql,
    })
    if (!rateLimit.allowed) {
      return jsonResponse(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many lab tool requests. Please wait a moment.' },
        429
      )
    }

    const quota = await getQuotaSnapshot(sql, userId)
    if (!quota.activeSessionId || quota.activeSessionId !== sessionId || quota.activeSessionState !== 'active') {
      return jsonResponse(
        { ok: false, code: 'SESSION_REQUIRED', message: 'Start an active tutor session first.' },
        409
      )
    }

    if (quota.remainingSeconds <= 0) {
      return jsonResponse({ ok: false, code: 'QUOTA_EXCEEDED', message: 'Tutoring time limit reached.' }, 429)
    }
  } catch (error) {
    const databaseTimedOut = dbTimeout.timedOut()
    console.error('[livekit/tool-preview] quota check', error)
    return jsonResponse(
      {
        ok: false,
        code: databaseTimedOut ? 'DATABASE_TIMEOUT' : 'QUOTA_CHECK_FAILED',
        message: databaseTimedOut
          ? 'Could not reach the session database quickly enough. Please try again.'
          : 'Could not verify the tutor session.',
      },
      503
    )
  } finally {
    dbTimeout.clear()
  }

  try {
    const { output, metrics } = await runLiveKitTutorToolWithMetrics(toolName, input, { userId, sessionId })
    const canvasActions = extractCanvasActionsFromToolResult(toolName, output, 80)

    return jsonResponse({
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
    return jsonResponse({ ok: false, code: 'TOOL_FAILED', message }, 400)
  }
}
