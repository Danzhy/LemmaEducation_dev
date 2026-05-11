import { createHash } from 'crypto'
import { getNeonSql } from '@/lib/tutor/db'

type Sql = ReturnType<typeof getNeonSql>

let tableEnsured = false

function normalizeSingleValue(value: string | null): string | null {
  if (!value) return null
  const first = value.split(',')[0]?.trim()
  return first || null
}

export function getTrustedClientIp(request: Request): string {
  const directCandidates = [
    request.headers.get('x-real-ip'),
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-forwarded-for'),
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeSingleValue(candidate)
    if (normalized) return normalized
  }

  const fallbackFingerprint = createHash('sha256')
    .update([
      request.headers.get('user-agent') ?? '',
      request.headers.get('accept-language') ?? '',
      request.headers.get('sec-ch-ua') ?? '',
      request.headers.get('x-vercel-id') ?? '',
      request.headers.get('cf-ray') ?? '',
    ].join('|'))
    .digest('hex')
    .slice(0, 32)

  return `fingerprint:${fallbackFingerprint}`
}

async function ensureRateLimitTable(sql: Sql) {
  if (tableEnsured) return
  await sql`
    CREATE TABLE IF NOT EXISTS public.request_rate_limits (
      id text PRIMARY KEY,
      endpoint text NOT NULL,
      subject_hash text NOT NULL,
      window_start timestamptz NOT NULL,
      hits integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS request_rate_limits_endpoint_window_idx
    ON public.request_rate_limits (endpoint, window_start DESC)
  `
  tableEnsured = true
}

export async function takeRateLimit(
  sql: Sql,
  options: {
    endpoint: string
    subject: string
    maxHits: number
    windowSeconds: number
  }
) {
  const { endpoint, subject, maxHits, windowSeconds } = options
  await ensureRateLimitTable(sql)

  const now = Date.now()
  const bucketMs = windowSeconds * 1000
  const bucketStartMs = Math.floor(now / bucketMs) * bucketMs
  const bucketStart = new Date(bucketStartMs).toISOString()
  const subjectHash = createHash('sha256')
    .update(`${endpoint}:${subject}`)
    .digest('hex')
  const id = `${endpoint}:${subjectHash}:${bucketStart}`

  const rows = await sql`
    INSERT INTO public.request_rate_limits (
      id,
      endpoint,
      subject_hash,
      window_start,
      hits
    )
    VALUES (
      ${id},
      ${endpoint},
      ${subjectHash},
      ${bucketStart}::timestamptz,
      1
    )
    ON CONFLICT (id)
    DO UPDATE
      SET hits = public.request_rate_limits.hits + 1,
          updated_at = NOW()
    RETURNING hits
  `

  const hits = Number((rows[0] as { hits?: number | string } | undefined)?.hits ?? 0)

  return {
    allowed: hits <= maxHits,
    hits,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((bucketStartMs + bucketMs - now) / 1000)
    ),
  }
}
