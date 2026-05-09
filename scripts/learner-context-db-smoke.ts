import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { getLearnerContextForUser } from '@/lib/tutor/learner-context'

function loadLocalEnv() {
  try {
    const envRaw = readFileSync('.env.local', 'utf8')
    for (const line of envRaw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      const key = trimmed.slice(0, index).trim()
      let value = trimmed.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] ||= value
    }
  } catch {
    // CI can run this without local env; skip below when the DB is unavailable.
  }
}

function isExternalDatabaseUnavailable(error: unknown) {
  const parts: string[] = []
  let current: unknown = error
  while (current && typeof current === 'object') {
    const record = current as Record<string, unknown>
    if (typeof record.message === 'string') parts.push(record.message)
    if (typeof record.code === 'string') parts.push(record.code)
    current = record.sourceError ?? record.cause
  }
  const text = parts.join(' ')
  return /\b(fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)\b/i.test(text)
}

async function main() {
  loadLocalEnv()
  if (!process.env.NEON_DATABASE_URL) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'NEON_DATABASE_URL is not configured.' }))
    return
  }

  const sql = neon(process.env.NEON_DATABASE_URL)
  const userId = `learner-context-smoke-${randomUUID()}`
  const sessionId = randomUUID()
  const currentSessionId = randomUUID()

  try {
    await sql`
      INSERT INTO tutor_sessions (
        id,
        user_id,
        started_at,
        ended_at,
        active_seconds,
        ended_reason,
        model_snapshot,
        language,
        grade_level,
        session_state,
        last_resumed_at,
        last_activity_at
      )
      VALUES
        (
          ${sessionId}::uuid,
          ${userId},
          NOW() - INTERVAL '2 days',
          NOW() - INTERVAL '2 days' + INTERVAL '18 minutes',
          1080,
          'user',
          'learner-context-smoke',
          'en',
          'Grade 5',
          'ended',
          NOW() - INTERVAL '2 days',
          NOW() - INTERVAL '2 days'
        ),
        (
          ${currentSessionId}::uuid,
          ${userId},
          NOW(),
          NULL,
          0,
          NULL,
          'learner-context-smoke-current',
          'en',
          'Grade 5',
          'active',
          NOW(),
          NOW()
        )
    `

    await sql`
      INSERT INTO tutor_messages (id, session_id, user_id, role, content, source, created_at)
      VALUES
        (
          ${randomUUID()}::uuid,
          ${sessionId}::uuid,
          ${userId},
          'user',
          'I am stuck simplifying equivalent fractions because I do not know which denominator to use.',
          'text',
          NOW() - INTERVAL '2 days'
        ),
        (
          ${randomUUID()}::uuid,
          ${sessionId}::uuid,
          ${userId},
          'assistant',
          'Use a fraction strip first, then explain what the denominator counts.',
          'assistant',
          NOW() - INTERVAL '2 days' + INTERVAL '1 minute'
        ),
        (
          ${randomUUID()}::uuid,
          ${currentSessionId}::uuid,
          ${userId},
          'user',
          'This current session should be excluded from history.',
          'text',
          NOW()
        )
    `

    await sql`
      INSERT INTO tutor_tool_events (
        id,
        session_id,
        user_id,
        event_type,
        tool_name,
        status,
        output_json,
        created_at
      )
      VALUES
        (
          ${randomUUID()}::uuid,
          ${sessionId}::uuid,
          ${userId},
          'tool_completed',
          'misconception_diagnosis',
          'completed',
          ${JSON.stringify({
            topic: 'fractions',
            findings: ['May be adding or subtracting denominators instead of finding a common denominator.'],
          })}::jsonb,
          NOW() - INTERVAL '2 days' + INTERVAL '2 minutes'
        ),
        (
          ${randomUUID()}::uuid,
          ${currentSessionId}::uuid,
          ${userId},
          'tool_completed',
          'misconception_diagnosis',
          'completed',
          ${JSON.stringify({
            topic: 'fractions',
            findings: ['This current session should be excluded from timeline.'],
          })}::jsonb,
          NOW()
        )
    `

    const context = await getLearnerContextForUser({ userId, sessionId: currentSessionId })
    assert.equal(context.ok, true)
    assert.equal(context.hasHistory, true)
    assert.equal(context.recentSessionCount, 1)
    assert(context.likelyTopics.includes('fractions'), 'Learner context should detect fractions.')
    assert(
      context.struggleSignals.some((signal) => /stuck/.test(signal)),
      'Learner context should detect stuck/confused signals.'
    )
    assert(
      context.misconceptionTimeline.some((item) => /common denominator/.test(item.signal)),
      'Learner context should include prior structured misconception timeline signals.'
    )
    assert(
      context.reviewSummaries.teacher.focusAreas.some((item) => /common denominator/i.test(item)),
      'Teacher memory summary should include structured misconception focus areas.'
    )
    assert(
      context.reviewSummaries.parent.privacyNote.includes('raw chat'),
      'Parent memory summary should include a privacy boundary.'
    )
    assert(!JSON.stringify(context.recentExcerpts).includes('current session should be excluded'))
    assert(!JSON.stringify(context.misconceptionTimeline).includes('current session should be excluded'))
    assert(!JSON.stringify(context.reviewSummaries).includes('current session should be excluded'))
    assert.match(context.instruction, /Use this learner history quietly/i)

    console.log(
      JSON.stringify({
        ok: true,
        topics: context.likelyTopics,
        signals: context.struggleSignals.length,
        timelineItems: context.misconceptionTimeline.length,
        hasReviewSummaries: Boolean(context.reviewSummaries.teacher.headline && context.reviewSummaries.parent.headline),
      })
    )
  } finally {
    await sql`DELETE FROM tutor_sessions WHERE user_id = ${userId}`
  }
}

main().catch((error) => {
  if (isExternalDatabaseUnavailable(error)) {
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'Neon database is configured but not reachable from this sandbox.',
      })
    )
    return
  }
  console.error(error)
  process.exit(1)
})
