import {
  TUTOR_INACTIVITY_PAUSE_SECONDS,
  TUTOR_MAX_SESSION_SECONDS,
  TUTOR_QUOTA_PERIOD,
  TUTOR_QUOTA_SECONDS,
} from '@/lib/tutor/constants'
import { ensureTutorUsageRow } from '@/lib/tutor/ensure-usage'
import { getNeonSql } from '@/lib/tutor/db'

type Sql = ReturnType<typeof getNeonSql>

type EndReason = 'user' | 'quota' | 'error' | 'unknown' | 'session_limit'
type SessionState = 'active' | 'paused' | 'ended'

type SessionRow = {
  id: string
  started_at: Date | string
  ended_at: Date | string | null
  active_seconds: number | string
  last_resumed_at: Date | string | null
  paused_at: Date | string | null
  last_activity_at: Date | string | null
  session_state: SessionState | null
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function asDate(value: Date | string | null): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function getSessionState(session: SessionRow): SessionState {
  if (session.ended_at) return 'ended'
  if (session.session_state === 'paused') return 'paused'
  if (session.session_state === 'ended') return 'ended'
  return 'active'
}

function getElapsedSeconds(startedAt: Date | string, endedAt: Date = new Date()): number {
  const started = toDate(startedAt)
  const elapsedMs = endedAt.getTime() - started.getTime()
  return Math.max(0, Math.floor(elapsedMs / 1000))
}

export function getTutorQuotaPeriodStart(now: Date = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const daysSinceMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  return start
}

function getSessionActiveSeconds(session: SessionRow, now: Date = new Date()): number {
  const persistedActiveSeconds = Number(session.active_seconds ?? 0)
  if (getSessionState(session) !== 'active') {
    return persistedActiveSeconds
  }

  const resumedAt = asDate(session.last_resumed_at) ?? toDate(session.started_at)
  return Math.min(
    TUTOR_MAX_SESSION_SECONDS,
    persistedActiveSeconds + getElapsedSeconds(resumedAt, now)
  )
}

function getInactivitySeconds(session: SessionRow, now: Date = new Date()): number {
  const lastActivityAt = asDate(session.last_activity_at) ?? toDate(session.started_at)
  return getElapsedSeconds(lastActivityAt, now)
}

export async function getPersistedUsage(sql: Sql, userId: string) {
  await ensureTutorUsageRow(userId, sql)
  const rows = await sql`
    SELECT
      COALESCE(total_active_seconds, 0)::bigint AS total_active_seconds,
      COALESCE(total_completed_sessions, 0)::int AS total_completed_sessions
    FROM tutor_usage
    WHERE user_id = ${userId}
  `

  const row = rows[0] as
    | {
        total_active_seconds?: string | bigint | number
        total_completed_sessions?: string | number
      }
    | undefined

  return {
    totalActiveSeconds: Number(row?.total_active_seconds ?? 0),
    totalCompletedSessions: Number(row?.total_completed_sessions ?? 0),
  }
}

export async function getPersistedUsageTotal(sql: Sql, userId: string): Promise<number> {
  const usage = await getPersistedUsage(sql, userId)
  return usage.totalActiveSeconds
}

export async function getPersistedWeeklyUsage(
  sql: Sql,
  userId: string,
  now: Date = new Date()
) {
  const periodStartedAt = getTutorQuotaPeriodStart(now)
  const periodEndsAt = new Date(periodStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
  const rows = await sql`
    SELECT COALESCE(SUM(
      LEAST(
        COALESCE(active_seconds, 0),
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (
            LEAST(ended_at, ${periodEndsAt}::timestamptz) -
            GREATEST(started_at, ${periodStartedAt}::timestamptz)
          )))
        )::int
      )
    ), 0)::bigint AS weekly_active_seconds
    FROM tutor_sessions
    WHERE user_id = ${userId}
      AND ended_at IS NOT NULL
      AND ended_at > ${periodStartedAt}
      AND started_at < ${periodEndsAt}
  `

  const row = rows[0] as
    | {
        weekly_active_seconds?: string | bigint | number
      }
    | undefined

  return {
    weeklyActiveSeconds: Number(row?.weekly_active_seconds ?? 0),
    periodStartedAt,
  }
}

export async function getOpenSessions(sql: Sql, userId: string): Promise<SessionRow[]> {
  const rows = await sql`
    SELECT
      id,
      started_at,
      ended_at,
      active_seconds,
      last_resumed_at,
      paused_at,
      last_activity_at,
      session_state
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
    SELECT
      id,
      started_at,
      ended_at,
      active_seconds,
      last_resumed_at,
      paused_at,
      last_activity_at,
      session_state
    FROM tutor_sessions
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}
    LIMIT 1
  `

  const row = rows[0] as SessionRow | undefined
  return row ?? null
}

export async function getQuotaSnapshot(sql: Sql, userId: string, now: Date = new Date()) {
  const usage = await getPersistedUsage(sql, userId)
  const weeklyUsage = await getPersistedWeeklyUsage(sql, userId, now)
  const openSessions = await getOpenSessions(sql, userId)
  const liveOpenSessionSeconds = openSessions.reduce(
    (sum, session) => sum + getSessionActiveSeconds(session, now),
    0
  )
  const activeSession = openSessions.at(-1) ?? null
  const activeSessionSeconds = activeSession ? getSessionActiveSeconds(activeSession, now) : 0
  const totalActiveSeconds = Math.min(
    TUTOR_QUOTA_SECONDS,
    weeklyUsage.weeklyActiveSeconds + liveOpenSessionSeconds
  )
  const usedSessionCount = usage.totalCompletedSessions + openSessions.length

  return {
    quotaSeconds: TUTOR_QUOTA_SECONDS,
    quotaPeriod: TUTOR_QUOTA_PERIOD,
    quotaPeriodStartedAt: weeklyUsage.periodStartedAt.toISOString(),
    maxSessionSeconds: TUTOR_MAX_SESSION_SECONDS,
    maxCompletedSessions: null,
    inactivityPauseSeconds: TUTOR_INACTIVITY_PAUSE_SECONDS,
    persistedActiveSeconds: weeklyUsage.weeklyActiveSeconds,
    lifetimeActiveSeconds: usage.totalActiveSeconds,
    weeklyActiveSeconds: weeklyUsage.weeklyActiveSeconds,
    totalCompletedSessions: usage.totalCompletedSessions,
    liveSessionSeconds: activeSessionSeconds,
    totalActiveSeconds,
    remainingSeconds: Math.max(0, TUTOR_QUOTA_SECONDS - totalActiveSeconds),
    usedSessionCount,
    remainingSessionCount: null,
    activeSessionId: activeSession?.id ?? null,
    activeSessionState: activeSession ? getSessionState(activeSession) : null,
    activeSessionSeconds,
    inactivitySeconds: activeSession ? getInactivitySeconds(activeSession, now) : 0,
  }
}

export async function pauseSessionById(
  sql: Sql,
  userId: string,
  sessionId: string,
  now: Date = new Date()
) {
  const session = await getOpenSessionById(sql, userId, sessionId)
  if (!session) {
    return { status: 'not_found' as const }
  }

  if (getSessionState(session) === 'ended') {
    return { status: 'already_ended' as const }
  }

  if (getSessionState(session) === 'paused') {
    return {
      status: 'already_paused' as const,
      activeSeconds: getSessionActiveSeconds(session, now),
    }
  }

  const activeSeconds = getSessionActiveSeconds(session, now)

  await sql`
    UPDATE tutor_sessions
    SET
      active_seconds = ${activeSeconds},
      session_state = 'paused',
      paused_at = NOW(),
      last_activity_at = NOW()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId} AND ended_at IS NULL
  `

  return {
    status: 'paused' as const,
    activeSeconds,
    sessionLimitReached: activeSeconds >= TUTOR_MAX_SESSION_SECONDS,
  }
}

export async function resumeSessionById(
  sql: Sql,
  userId: string,
  sessionId: string,
  now: Date = new Date()
) {
  const session = await getOpenSessionById(sql, userId, sessionId)
  if (!session) {
    return { status: 'not_found' as const }
  }

  if (getSessionState(session) === 'ended') {
    return { status: 'already_ended' as const }
  }

  const activeSeconds = getSessionActiveSeconds(session, now)
  if (activeSeconds >= TUTOR_MAX_SESSION_SECONDS) {
    await finalizeSessionById(sql, userId, sessionId, 'session_limit', now)
    return { status: 'session_limit' as const }
  }

  const snapshot = await getQuotaSnapshot(sql, userId, now)
  if (snapshot.remainingSeconds <= 0) {
    return { status: 'quota_exceeded' as const }
  }

  if (getSessionState(session) === 'active') {
    return { status: 'already_active' as const, activeSeconds }
  }

  await sql`
    UPDATE tutor_sessions
    SET
      session_state = 'active',
      last_resumed_at = NOW(),
      paused_at = NULL,
      last_activity_at = NOW()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId} AND ended_at IS NULL
  `

  return { status: 'resumed' as const }
}

export async function touchSessionActivity(
  sql: Sql,
  userId: string,
  sessionId: string
) {
  const rows = await sql`
    UPDATE tutor_sessions
    SET last_activity_at = NOW()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId} AND ended_at IS NULL
    RETURNING id
  `

  return Boolean(rows[0])
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

  if (getSessionState(session) === 'ended') {
    return { status: 'already_ended' as const, appliedSeconds: 0, endedReason }
  }

  await ensureTutorUsageRow(userId, sql)
  const weeklyUsage = await getPersistedWeeklyUsage(sql, userId, now)
  const rawActiveSeconds = getSessionActiveSeconds(session, now)
  const sessionActiveSeconds = Math.min(rawActiveSeconds, TUTOR_MAX_SESSION_SECONDS)
  const remainingBeforeQuota = Math.max(0, TUTOR_QUOTA_SECONDS - weeklyUsage.weeklyActiveSeconds)
  const appliedSeconds = Math.min(sessionActiveSeconds, remainingBeforeQuota)
  const sessionLimitReached = rawActiveSeconds >= TUTOR_MAX_SESSION_SECONDS
  const quotaExceeded =
    sessionActiveSeconds > remainingBeforeQuota ||
    weeklyUsage.weeklyActiveSeconds >= TUTOR_QUOTA_SECONDS

  let finalReason: EndReason = endedReason
  if (sessionLimitReached) {
    finalReason = 'session_limit'
  } else if (quotaExceeded) {
    finalReason = 'quota'
  }

  const shouldIncrementCompletedSessions = sessionActiveSeconds > 0 ? 1 : 0
  const updatedRows = await sql`
    WITH updated_session AS (
      UPDATE tutor_sessions
      SET
        active_seconds = ${appliedSeconds},
        ended_at = NOW(),
        ended_reason = ${finalReason},
        session_state = 'ended',
        paused_at = NULL,
        last_activity_at = NOW()
      WHERE id = ${sessionId}::uuid AND user_id = ${userId} AND ended_at IS NULL
      RETURNING id
    ),
    updated_usage AS (
      UPDATE tutor_usage
      SET
        total_active_seconds = total_active_seconds + ${appliedSeconds},
        total_completed_sessions = total_completed_sessions + ${shouldIncrementCompletedSessions},
        updated_at = NOW()
      WHERE user_id = ${userId}
        AND EXISTS (SELECT 1 FROM updated_session)
      RETURNING user_id
    )
    SELECT id FROM updated_session
  `

  if (!updatedRows[0]) {
    return { status: 'already_ended' as const, appliedSeconds: 0, endedReason }
  }

  return {
    status: 'ended' as const,
    appliedSeconds,
    endedReason: finalReason,
    quotaExceeded,
    sessionLimitReached,
    remainingSeconds: Math.max(0, remainingBeforeQuota - appliedSeconds),
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
  let sessionLimitReached = false

  for (const session of openSessions) {
    const result = await finalizeSessionById(sql, userId, session.id, endedReason, now)
    if (result.status === 'ended') {
      appliedSeconds += result.appliedSeconds
      quotaExceeded = quotaExceeded || result.quotaExceeded
      sessionLimitReached = sessionLimitReached || result.sessionLimitReached
    }
  }

  const snapshot = await getQuotaSnapshot(sql, userId, now)

  return {
    appliedSeconds,
    quotaExceeded,
    sessionLimitReached,
    ...snapshot,
  }
}
