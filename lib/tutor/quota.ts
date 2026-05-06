import { TUTOR_QUOTA_SECONDS } from '@/lib/tutor/constants'
import { ensureTutorUsageRow } from '@/lib/tutor/ensure-usage'
import { getNeonSql } from '@/lib/tutor/db'

type Sql = ReturnType<typeof getNeonSql>

type SessionRow = {
  id: string
  started_at: Date | string
  ended_at: Date | null
}

type EndReason = 'user' | 'quota' | 'error' | 'unknown'

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function getElapsedSeconds(startedAt: Date | string, endedAt: Date = new Date()): number {
  const started = toDate(startedAt)
  const elapsedMs = endedAt.getTime() - started.getTime()
  return Math.max(0, Math.floor(elapsedMs / 1000))
}

export async function getPersistedUsageTotal(sql: Sql, userId: string): Promise<number> {
  await ensureTutorUsageRow(userId)
  const rows = await sql`
    SELECT COALESCE(total_active_seconds, 0)::bigint AS total
    FROM tutor_usage
    WHERE user_id = ${userId}
  `
  return Number((rows[0] as { total: string | bigint } | undefined)?.total ?? 0)
}

export async function getOpenSessions(sql: Sql, userId: string): Promise<SessionRow[]> {
  const rows = await sql`
    SELECT id, started_at, ended_at
    FROM tutor_sessions
    WHERE user_id = ${userId} AND ended_at IS NULL
    ORDER BY started_at ASC
  `
  return rows as SessionRow[]
}

export async function getOpenSessionById(
  sql: Sql,
  userId: string,
  sessionId: string
): Promise<SessionRow | null> {
  const rows = await sql`
    SELECT id, started_at, ended_at
    FROM tutor_sessions
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}
    LIMIT 1
  `

  const row = rows[0] as SessionRow | undefined
  return row ?? null
}

export async function getQuotaSnapshot(sql: Sql, userId: string, now: Date = new Date()) {
  const persistedActiveSeconds = await getPersistedUsageTotal(sql, userId)
  const openSessions = await getOpenSessions(sql, userId)
  const activeSession = openSessions.at(-1) ?? null
  const liveSessionSeconds = activeSession
    ? getElapsedSeconds(activeSession.started_at, now)
    : 0
  const totalActiveSeconds = Math.min(
    TUTOR_QUOTA_SECONDS,
    persistedActiveSeconds + liveSessionSeconds
  )

  return {
    quotaSeconds: TUTOR_QUOTA_SECONDS,
    persistedActiveSeconds,
    liveSessionSeconds,
    totalActiveSeconds,
    remainingSeconds: Math.max(0, TUTOR_QUOTA_SECONDS - totalActiveSeconds),
    activeSessionId: activeSession?.id ?? null,
  }
}

export async function finalizeSessionById(
  sql: Sql,
  userId: string,
  sessionId: string,
  endedReason: EndReason,
  now: Date = new Date()
) {
  const session = await getOpenSessionById(sql, userId, sessionId)
  if (!session) {
    return { status: 'not_found' as const }
  }

  if (session.ended_at) {
    return { status: 'already_ended' as const, appliedSeconds: 0, endedReason }
  }

  const persistedActiveSeconds = await getPersistedUsageTotal(sql, userId)
  const elapsedSeconds = getElapsedSeconds(session.started_at, now)
  const remainingBefore = Math.max(0, TUTOR_QUOTA_SECONDS - persistedActiveSeconds)
  const appliedSeconds = Math.min(elapsedSeconds, remainingBefore)
  const quotaExceeded = elapsedSeconds > remainingBefore
  const finalReason: EndReason = quotaExceeded ? 'quota' : endedReason

  if (appliedSeconds > 0) {
    await sql`
      UPDATE tutor_usage
      SET total_active_seconds = total_active_seconds + ${appliedSeconds}, updated_at = NOW()
      WHERE user_id = ${userId}
    `
  }

  await sql`
    UPDATE tutor_sessions
    SET
      active_seconds = ${appliedSeconds},
      ended_at = NOW(),
      ended_reason = ${finalReason}
    WHERE id = ${sessionId}::uuid AND user_id = ${userId} AND ended_at IS NULL
  `

  return {
    status: 'ended' as const,
    appliedSeconds,
    endedReason: finalReason,
    quotaExceeded,
    remainingSeconds: Math.max(0, remainingBefore - appliedSeconds),
  }
}

export async function reconcileOpenSessions(
  sql: Sql,
  userId: string,
  endedReason: EndReason = 'unknown',
  now: Date = new Date()
) {
  const openSessions = await getOpenSessions(sql, userId)
  let appliedSeconds = 0
  let quotaExceeded = false

  for (const session of openSessions) {
    const result = await finalizeSessionById(sql, userId, session.id, endedReason, now)
    if (result.status === 'ended') {
      appliedSeconds += result.appliedSeconds
      quotaExceeded = quotaExceeded || result.quotaExceeded
    }
  }

  const snapshot = await getQuotaSnapshot(sql, userId, now)

  return {
    appliedSeconds,
    quotaExceeded,
    ...snapshot,
  }
}
