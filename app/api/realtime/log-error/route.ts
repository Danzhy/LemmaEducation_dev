/**
 * Client-side error logging endpoint.
 * Receives errors from the browser and logs them server-side for debugging.
 * Does not expose errors to the client response.
 */

import { NextResponse } from 'next/server'
import { getTrustedClientIp, takeRateLimit } from '@/lib/request-rate-limit'
import { getNeonSql } from '@/lib/tutor/db'

const MAX_LOG_ERROR_BODY_BYTES = 10_000
const MAX_LOG_ERROR_CHARS = 2_000
const MAX_LOG_ERROR_SOURCE_CHARS = 80
const LOG_ERROR_RATE_LIMIT_WINDOW_SECONDS = 15 * 60
const LOG_ERROR_RATE_LIMIT_MAX_HITS = 20

function redactSensitiveLogText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/npg_[A-Za-z0-9_-]+/g, 'npg_[redacted]')
    .replace(/postgres(?:ql)?:\/\/[^\\s'"]+/gi, 'postgresql://[redacted]')
    .slice(0, MAX_LOG_ERROR_CHARS)
}

export async function POST(request: Request) {
  try {
    const sql = getNeonSql()
    const rateLimit = await takeRateLimit(sql, {
      endpoint: 'realtime-log-error',
      subject: getTrustedClientIp(request),
      maxHits: LOG_ERROR_RATE_LIMIT_MAX_HITS,
      windowSeconds: LOG_ERROR_RATE_LIMIT_WINDOW_SECONDS,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', message: 'Too many log events.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }
  } catch (error) {
    console.error('[Lemma Tutor] [log-error] Rate limit check failed', error)
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMIT_CHECK_FAILED', message: 'Could not accept log event.' },
      { status: 503 }
    )
  }

  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).length > MAX_LOG_ERROR_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Log payload is too large.' },
        { status: 413 }
      )
    }

    const body = rawBody.trim() ? JSON.parse(rawBody) : {}
    const source =
      typeof body?.source === 'string'
        ? redactSensitiveLogText(body.source).slice(0, MAX_LOG_ERROR_SOURCE_CHARS)
        : 'unknown'
    const rawError =
      typeof body?.rawError === 'string' ? body.rawError : String(body?.rawError ?? source)
    console.error(`[Lemma Tutor] [${source}]`, redactSensitiveLogText(rawError))
  } catch {
    console.error('[Lemma Tutor] [log-error] Invalid log payload')
  }
  return NextResponse.json({ ok: true })
}
