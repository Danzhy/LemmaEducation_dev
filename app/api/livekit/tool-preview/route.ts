import { NextRequest, NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { createTutorDbTimeout } from '@/lib/tutor/db-timeout'
import { extractCanvasActionsFromToolResult } from '@/lib/tutor/canvas-action-parser'
import { LIVEKIT_TUTOR_TOOL_NAMES } from '@/lib/livekit/tool-catalog'
import { runLiveKitTutorToolWithMetrics } from '@/lib/livekit/tool-runner'

const MAX_TOOL_INPUT_BYTES = 12_000

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' }, 401)
  }

  const dbTimeout = createTutorDbTimeout()
  try {
    const sql = getNeonSql({ signal: dbTimeout.signal })
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'livekit-tool-preview',
      userId,
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
  } catch (error) {
    const databaseTimedOut = dbTimeout.timedOut()
    console.error('[livekit/tool-preview] rate limit', error)
    return jsonResponse(
      {
        ok: false,
        code: databaseTimedOut ? 'DATABASE_TIMEOUT' : 'RATE_LIMIT_CHECK_FAILED',
        message: 'Could not verify the lab tool limit. Please try again.',
      },
      503
    )
  } finally {
    dbTimeout.clear()
  }

  const body = (await request.json().catch(() => null)) as {
    toolName?: unknown
    input?: unknown
  } | null

  const toolName = typeof body?.toolName === 'string' ? body.toolName : ''
  if (!LIVEKIT_TUTOR_TOOL_NAMES.includes(toolName as (typeof LIVEKIT_TUTOR_TOOL_NAMES)[number])) {
    return jsonResponse({ ok: false, code: 'UNSUPPORTED_TOOL', message: 'Unsupported lab tool.' }, 400)
  }

  const serializedInput = JSON.stringify(body?.input ?? {})
  if (new TextEncoder().encode(serializedInput).length > MAX_TOOL_INPUT_BYTES) {
    return jsonResponse({ ok: false, code: 'TOOL_INPUT_TOO_LARGE', message: 'Tool input is too large.' }, 413)
  }

  try {
    const { output, metrics } = await runLiveKitTutorToolWithMetrics(toolName, body?.input ?? {}, { userId })
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
