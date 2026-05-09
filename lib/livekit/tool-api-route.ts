import { NextResponse } from 'next/server'
import { getNeonSql as getNeonSqlDefault } from '@/lib/tutor/db'
import { takeTutorApiRateLimit as takeTutorApiRateLimitDefault } from '@/lib/tutor/api-rate-limit'
import { getSessionUserId as getSessionUserIdDefault } from '@/lib/tutor/session-user'
import { getQuotaSnapshot as getQuotaSnapshotDefault } from '@/lib/tutor/quota'
import { createTutorDbTimeout as createTutorDbTimeoutDefault } from '@/lib/tutor/db-timeout'
import {
  extractCanvasActionsFromToolResult as extractCanvasActionsFromToolResultDefault,
} from '@/lib/tutor/canvas-action-parser'
import { LIVEKIT_TUTOR_TOOL_NAMES } from '@/lib/livekit/tool-catalog'
import {
  runLiveKitTutorToolWithMetrics as runLiveKitTutorToolWithMetricsDefault,
} from '@/lib/livekit/tool-runner'

const MAX_TOOL_INPUT_BYTES = 12_000
const DEFAULT_MAX_CANVAS_ACTIONS_PER_RESULT = 80
const TOOL_RATE_LIMIT_WINDOW_SECONDS = 60 * 60

export type LiveKitToolEndpointConfig = {
  endpoint: 'livekit-tool' | 'livekit-tool-preview'
  maxHits: number
  rateLimitedMessage: string
  unsupportedToolMessage: string
  quotaLogPrefix: string
  includeRetryAfterHeader?: boolean
  maxCanvasActionsPerResult?: number
}

export const LIVEKIT_TOOL_ENDPOINT_CONFIGS = {
  worker: {
    endpoint: 'livekit-tool',
    maxHits: 240,
    rateLimitedMessage: 'Too many LiveKit tool calls.',
    unsupportedToolMessage: 'That LiveKit tutor tool is not supported.',
    quotaLogPrefix: '[livekit/tool] quota check',
    includeRetryAfterHeader: true,
    maxCanvasActionsPerResult: DEFAULT_MAX_CANVAS_ACTIONS_PER_RESULT,
  },
  preview: {
    endpoint: 'livekit-tool-preview',
    maxHits: 120,
    rateLimitedMessage: 'Too many lab tool requests. Please wait a moment.',
    unsupportedToolMessage: 'Unsupported lab tool.',
    quotaLogPrefix: '[livekit/tool-preview] quota check',
    maxCanvasActionsPerResult: DEFAULT_MAX_CANVAS_ACTIONS_PER_RESULT,
  },
} satisfies Record<string, LiveKitToolEndpointConfig>

export type LiveKitToolRouteDependencies = {
  getSessionUserId: typeof getSessionUserIdDefault
  getNeonSql: typeof getNeonSqlDefault
  takeTutorApiRateLimit: typeof takeTutorApiRateLimitDefault
  getQuotaSnapshot: typeof getQuotaSnapshotDefault
  createTutorDbTimeout: typeof createTutorDbTimeoutDefault
  extractCanvasActionsFromToolResult: typeof extractCanvasActionsFromToolResultDefault
  runLiveKitTutorToolWithMetrics: typeof runLiveKitTutorToolWithMetricsDefault
  consoleError: typeof console.error
}

const defaultDependencies: LiveKitToolRouteDependencies = {
  getSessionUserId: getSessionUserIdDefault,
  getNeonSql: getNeonSqlDefault,
  takeTutorApiRateLimit: takeTutorApiRateLimitDefault,
  getQuotaSnapshot: getQuotaSnapshotDefault,
  createTutorDbTimeout: createTutorDbTimeoutDefault,
  extractCanvasActionsFromToolResult: extractCanvasActionsFromToolResultDefault,
  runLiveKitTutorToolWithMetrics: runLiveKitTutorToolWithMetricsDefault,
  consoleError: console.error,
}

function jsonResponse(payload: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, { status, headers })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

export async function handleLiveKitToolRequest(
  request: Request,
  config: LiveKitToolEndpointConfig,
  dependencyOverrides: Partial<LiveKitToolRouteDependencies> = {}
) {
  const deps = { ...defaultDependencies, ...dependencyOverrides }
  const userId = await deps.getSessionUserId()
  if (!userId) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: 'Please sign in again.' }, 401)
  }

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) {
    return jsonResponse({ ok: false, code: 'INVALID_JSON', message: 'Tool request must be valid JSON.' }, 400)
  }

  const sessionId = parseString(body.sessionId, 80)
  const toolName = parseString(body.toolName, 120)
  const input = body.input ?? {}

  if (!sessionId || !toolName) {
    return jsonResponse({ ok: false, code: 'MISSING_FIELDS', message: 'sessionId and toolName are required.' }, 400)
  }

  if (!LIVEKIT_TUTOR_TOOL_NAMES.includes(toolName as (typeof LIVEKIT_TUTOR_TOOL_NAMES)[number])) {
    return jsonResponse({ ok: false, code: 'UNSUPPORTED_TOOL', message: config.unsupportedToolMessage }, 400)
  }

  if (inputIsTooLarge(input)) {
    return jsonResponse({ ok: false, code: 'TOOL_INPUT_TOO_LARGE', message: 'Tool input is too large.' }, 413)
  }

  const dbTimeout = deps.createTutorDbTimeout()
  try {
    const sql = deps.getNeonSql({ signal: dbTimeout.signal })
    const rateLimit = await deps.takeTutorApiRateLimit(request, {
      endpoint: config.endpoint,
      userId,
      sessionId,
      maxHits: config.maxHits,
      windowSeconds: TOOL_RATE_LIMIT_WINDOW_SECONDS,
      sql,
    })

    if (!rateLimit.allowed) {
      return jsonResponse(
        { ok: false, code: 'RATE_LIMITED', message: config.rateLimitedMessage },
        429,
        config.includeRetryAfterHeader && rateLimit.retryAfterSeconds
          ? { 'Retry-After': String(rateLimit.retryAfterSeconds) }
          : undefined
      )
    }

    const quota = await deps.getQuotaSnapshot(sql, userId)
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
    deps.consoleError(config.quotaLogPrefix, error)
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
    const { output, metrics } = await deps.runLiveKitTutorToolWithMetrics(toolName, input, { userId, sessionId })
    const canvasActions = deps.extractCanvasActionsFromToolResult(
      toolName,
      output,
      config.maxCanvasActionsPerResult ?? DEFAULT_MAX_CANVAS_ACTIONS_PER_RESULT
    )

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
