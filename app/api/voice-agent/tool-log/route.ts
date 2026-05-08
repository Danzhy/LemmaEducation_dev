import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/tutor/db'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { takeTutorApiRateLimit } from '@/lib/tutor/api-rate-limit'

const ALLOWED_EVENT_TYPES = new Set([
  'tool_started',
  'tool_completed',
  'tool_failed',
  'canvas_action',
])
const MAX_TOOL_LOG_JSON_BYTES = 32_000
const MAX_TOOL_LOG_METADATA_BYTES = 8_000

function jsonByteLength(value: unknown) {
  if (value === undefined || value === null) return 0
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
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

    let body: {
      sessionId?: string
      eventType?: string
      toolName?: string
      status?: string
      input?: unknown
      output?: unknown
      metadata?: unknown
    }

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Invalid JSON.' },
        { status: 400 }
      )
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const eventType =
      typeof body.eventType === 'string' && ALLOWED_EVENT_TYPES.has(body.eventType)
        ? body.eventType
        : null
    const toolName =
      typeof body.toolName === 'string' ? body.toolName.trim().slice(0, 120) : ''
    const status =
      typeof body.status === 'string' ? body.status.trim().slice(0, 40) : eventType ?? 'completed'

    if (!sessionId || !eventType || !toolName) {
      return NextResponse.json(
        {
          ok: false,
          code: 'BAD_REQUEST',
          message: 'sessionId, eventType, and toolName are required.',
        },
        { status: 400 }
      )
    }

    if (
      jsonByteLength(body.input) > MAX_TOOL_LOG_JSON_BYTES ||
      jsonByteLength(body.output) > MAX_TOOL_LOG_JSON_BYTES ||
      jsonByteLength(body.metadata) > MAX_TOOL_LOG_METADATA_BYTES
    ) {
      return NextResponse.json(
        { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Tool event payload is too large.' },
        { status: 413 }
      )
    }

    const sql = getNeonSql()
    const rateLimit = await takeTutorApiRateLimit(request, {
      endpoint: 'voice-agent-tool-log',
      userId,
      sessionId,
      maxHits: 1200,
      windowSeconds: 60 * 60,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many tool events.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const sessionRows = await sql`
      SELECT id
      FROM tutor_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
      LIMIT 1
    `
    if (!sessionRows[0]) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Session not found.' },
        { status: 404 }
      )
    }

    await sql`
      INSERT INTO tutor_tool_events (
        id,
        session_id,
        user_id,
        event_type,
        tool_name,
        status,
        input_json,
        output_json,
        metadata_json
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${sessionId}::uuid,
        ${userId},
        ${eventType},
        ${toolName},
        ${status},
        ${body.input !== undefined ? JSON.stringify(body.input) : null}::jsonb,
        ${body.output !== undefined ? JSON.stringify(body.output) : null}::jsonb,
        ${body.metadata !== undefined ? JSON.stringify(body.metadata) : null}::jsonb
      )
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[voice-agent/tool-log]', error)
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message: 'Could not save tool event.' },
      { status: 500 }
    )
  }
}
