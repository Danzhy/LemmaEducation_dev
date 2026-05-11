import assert from 'node:assert/strict'
import { getQuotaSnapshot, getTutorQuotaPeriodStart } from '@/lib/tutor/quota'
import type { getNeonSql } from '@/lib/tutor/db'

type Sql = ReturnType<typeof getNeonSql>

function createSqlStub(options: {
  lifetimeActiveSeconds: number
  totalCompletedSessions: number
  weeklyActiveSeconds: number
  openSessions?: unknown[]
}): Sql {
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join('?')
    if (query.includes('INSERT INTO tutor_usage')) {
      return []
    }
    if (query.includes('FROM tutor_usage')) {
      return [
        {
          total_active_seconds: options.lifetimeActiveSeconds,
          total_completed_sessions: options.totalCompletedSessions,
        },
      ]
    }
    if (query.includes('weekly_active_seconds')) {
      return [{ weekly_active_seconds: options.weeklyActiveSeconds }]
    }
    if (query.includes('FROM tutor_sessions') && query.includes('ended_at IS NULL')) {
      return options.openSessions ?? []
    }
    throw new Error(`Unexpected quota SQL in smoke test: ${query}`)
  }) as Sql

  return sql
}

async function main() {
  assert.equal(
    getTutorQuotaPeriodStart(new Date('2026-05-10T12:00:00.000Z')).toISOString(),
    '2026-05-04T00:00:00.000Z'
  )
  assert.equal(
    getTutorQuotaPeriodStart(new Date('2026-05-11T00:15:00.000Z')).toISOString(),
    '2026-05-11T00:00:00.000Z'
  )

  const snapshot = await getQuotaSnapshot(
    createSqlStub({
      lifetimeActiveSeconds: 99_999,
      totalCompletedSessions: 17,
      weeklyActiveSeconds: 3_600,
      openSessions: [
        {
          id: 'active-session',
          started_at: '2026-05-10T11:58:00.000Z',
          ended_at: null,
          active_seconds: 0,
          last_resumed_at: '2026-05-10T11:58:00.000Z',
          paused_at: null,
          last_activity_at: '2026-05-10T11:59:45.000Z',
          session_state: 'active',
        },
      ],
    }),
    'student-1',
    new Date('2026-05-10T12:00:00.000Z')
  )

  assert.equal(snapshot.quotaPeriod, 'week')
  assert.equal(snapshot.quotaPeriodStartedAt, '2026-05-04T00:00:00.000Z')
  assert.equal(snapshot.quotaSeconds, 14_400)
  assert.equal(snapshot.weeklyActiveSeconds, 3_600)
  assert.equal(snapshot.persistedActiveSeconds, 3_600)
  assert.equal(snapshot.lifetimeActiveSeconds, 99_999)
  assert.equal(snapshot.totalActiveSeconds, 3_720)
  assert.equal(snapshot.remainingSeconds, 10_680)
  assert.equal(snapshot.maxCompletedSessions, null)
  assert.equal(snapshot.remainingSessionCount, null)

  console.log('tutor quota policy smoke passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
