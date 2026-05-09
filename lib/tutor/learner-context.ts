import { getNeonSql } from '@/lib/tutor/db'
import { getTutorSessionOwnerUserId, isTutorSessionId } from '@/lib/tutor/history'
import type { LearnerMisconceptionTimelineItem } from '@/lib/voice-agent/types'

const MAX_EXCERPT_CHARS = 220
const MAX_TIMELINE_EVIDENCE_CHARS = 120

type SessionSummaryRow = {
  id: string
  started_at: Date | string
  active_seconds: number | string
  grade_level: string | null
  model_snapshot: string | null
  first_user_message: string | null
  message_count: number | string
}

type MessageRow = {
  role: 'user' | 'assistant'
  content: string
  created_at: Date | string
}

type ToolRow = {
  tool_name: string
  count: number | string
}

type DiagnosticToolRow = {
  tool_name: string
  output_json: unknown
  created_at: Date | string
}

export type LearnerContextResponse = {
  ok: true
  hasHistory: boolean
  recentSessionCount: number
  recentActiveMinutes: number
  gradeLevels: string[]
  likelyTopics: string[]
  struggleSignals: string[]
  misconceptionTimeline: LearnerMisconceptionTimelineItem[]
  recentExcerpts: Array<{ role: 'user' | 'assistant'; content: string }>
  recentTools: Array<{ toolName: string; count: number }>
  suggestedTutorAdjustments: string[]
  instruction: string
}

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ['fractions', /\bfraction|denominator|numerator|equivalent|simplify|mixed number\b/i],
  ['decimals', /\bdecimal|tenths|hundredths|place value\b/i],
  ['percents', /\bpercent|percentage|discount|tax|tip\b/i],
  ['ratios and rates', /\bratio|rate|unit rate|proportion|scale\b/i],
  ['linear equations', /\bequation|solve for x|linear|variable|unknown\b/i],
  ['coordinate graphing', /\bgraph|coordinate|slope|intercept|plot|axis\b/i],
  ['geometry', /\barea|perimeter|angle|triangle|rectangle|circle|volume\b/i],
  ['data and statistics', /\bmean|median|mode|range|bar chart|line plot|data\b/i],
  ['probability', /\bprobability|chance|likely|outcome\b/i],
  ['word problems', /\bword problem|story problem|real world|setup\b/i],
]

const STRUGGLE_PATTERNS: Array<[string, RegExp]> = [
  ['student says they are stuck', /\bstuck|confused|lost|do not know|don't know|not sure\b/i],
  ['answer checking is frequent', /\bcheck|is this right|correct|wrong|my answer\b/i],
  ['needs setup support', /\bset up|start|where do i begin|what should i do first\b/i],
  ['may rush to final answers', /\bjust tell me|give me the answer|answer only\b/i],
  ['sign or operation mistakes may be recurring', /\bnegative|minus|sign|operation|undo\b/i],
]

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value)
}

function compactExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS)
}

function compactTimelineEvidence(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TIMELINE_EVIDENCE_CHARS)
}

function uniqueInOrder(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function scoreTopics(text: string) {
  return TOPIC_PATTERNS
    .map(([topic, pattern]) => ({ topic, count: (text.match(new RegExp(pattern.source, 'gi')) ?? []).length }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .map((item) => item.topic)
}

function findStruggleSignals(text: string) {
  return STRUGGLE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([signal]) => signal)
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
}

function topicFromToolOutput(output: Record<string, unknown>, fallback: string) {
  const rawTopic = stringValue(output.label) || stringValue(output.topic) || fallback
  const scoredTopic = scoreTopics(rawTopic)[0]
  return scoredTopic || rawTopic.toLowerCase().replace(/_/g, ' ').trim() || 'recent math work'
}

function priorityFromToolOutput(output: Record<string, unknown>): LearnerMisconceptionTimelineItem['priority'] {
  const severity = stringValue(output.severity).toLowerCase()
  if (severity === 'blocker') return 'blocker'
  if (severity === 'reteach') return 'reteach'
  const verdict = stringValue(output.verdict).toLowerCase()
  if (verdict === 'invalid') return 'reteach'
  return 'watch'
}

function patternLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractTimelineSignalsFromToolRow(row: DiagnosticToolRow) {
  const output = recordValue(row.output_json)
  if (!output) return []

  const topic = topicFromToolOutput(
    output,
    [row.tool_name, stringValue(output.hintTarget), stringValue(output.reason)].filter(Boolean).join(' ')
  )
  const priority = priorityFromToolOutput(output)
  const lastSeen = asDate(row.created_at).toISOString()

  if (row.tool_name === 'mistake_pattern_classifier') {
    const primaryPattern = patternLabel(stringValue(output.primaryPattern))
    if (!primaryPattern || primaryPattern === 'unclear') return []
    return [
      {
        topic,
        signal: `Recurring ${primaryPattern} pattern`,
        priority,
        sourceTool: row.tool_name,
        evidence: `Tool classified this as ${priority}.`,
        lastSeen,
      },
    ]
  }

  if (row.tool_name === 'misconception_diagnosis') {
    return stringArrayValue(output.findings).map((finding) => ({
      topic,
      signal: compactTimelineEvidence(finding),
      priority,
      sourceTool: row.tool_name,
      evidence: 'Misconception diagnosis returned this learning pattern.',
      lastSeen,
    }))
  }

  if (row.tool_name === 'math_check_step') {
    const verdict = stringValue(output.verdict).toLowerCase()
    if (verdict !== 'invalid' && verdict !== 'unclear') return []
    const hintTarget = stringValue(output.hintTarget)
    if (!hintTarget) return []
    return [
      {
        topic,
        signal: `Needs review: ${compactTimelineEvidence(hintTarget)}`,
        priority,
        sourceTool: row.tool_name,
        evidence: `Step check returned ${verdict}.`,
        lastSeen,
      },
    ]
  }

  if (row.tool_name === 'session_mastery_snapshot') {
    return stringArrayValue(output.needsReview).map((need) => ({
      topic,
      signal: compactTimelineEvidence(need),
      priority,
      sourceTool: row.tool_name,
      evidence: 'Session mastery snapshot marked this for review.',
      lastSeen,
    }))
  }

  return []
}

export function buildLearnerMisconceptionTimeline(
  rows: DiagnosticToolRow[]
): LearnerMisconceptionTimelineItem[] {
  const timeline = new Map<
    string,
    LearnerMisconceptionTimelineItem & { priorityScore: number; seenTime: number }
  >()
  const priorityScore: Record<LearnerMisconceptionTimelineItem['priority'], number> = {
    watch: 1,
    reteach: 2,
    blocker: 3,
  }

  for (const row of rows) {
    for (const item of extractTimelineSignalsFromToolRow(row)) {
      const key = `${item.topic.toLowerCase()}::${item.signal.toLowerCase()}`
      const seenTime = asDate(item.lastSeen).getTime()
      const existing = timeline.get(key)
      if (!existing) {
        timeline.set(key, {
          topic: item.topic,
          signal: item.signal,
          count: 1,
          priority: item.priority,
          sourceTools: [item.sourceTool],
          recentEvidence: [item.evidence],
          lastSeen: item.lastSeen,
          priorityScore: priorityScore[item.priority],
          seenTime,
        })
        continue
      }

      existing.count += 1
      if (!existing.sourceTools.includes(item.sourceTool)) {
        existing.sourceTools.push(item.sourceTool)
      }
      if (!existing.recentEvidence.includes(item.evidence) && existing.recentEvidence.length < 3) {
        existing.recentEvidence.push(item.evidence)
      }
      if (priorityScore[item.priority] > existing.priorityScore) {
        existing.priority = item.priority
        existing.priorityScore = priorityScore[item.priority]
      }
      if (seenTime > existing.seenTime) {
        existing.lastSeen = item.lastSeen
        existing.seenTime = seenTime
      }
    }
  }

  return [...timeline.values()]
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore
      if (right.count !== left.count) return right.count - left.count
      return right.seenTime - left.seenTime
    })
    .slice(0, 6)
    .map(({ priorityScore: _priorityScore, seenTime: _seenTime, ...item }) => item)
}

function buildLearnerInstruction(input: Omit<LearnerContextResponse, 'ok' | 'instruction'>) {
  if (!input.hasHistory) {
    return 'No previous tutoring history was found for this learner. Start with one diagnostic question and adapt from the current work.'
  }

  return [
    'Use this learner history quietly to adapt the next tutoring move.',
    input.likelyTopics.length > 0 ? `Recent topics: ${input.likelyTopics.join(', ')}.` : '',
    input.struggleSignals.length > 0 ? `Observed signals: ${input.struggleSignals.join('; ')}.` : '',
    input.misconceptionTimeline.length > 0
      ? `Misconception timeline: ${input.misconceptionTimeline
          .slice(0, 3)
          .map((item) => `${item.topic} - ${item.signal} (${item.count}x)`)
          .join('; ')}.`
      : '',
    input.suggestedTutorAdjustments.length > 0
      ? `Tutor adjustments: ${input.suggestedTutorAdjustments.join(' ')}`
      : '',
    'Do not quote old session history unless the student asks. Use it to choose pacing, examples, and whether to ask a diagnostic question.',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildSuggestedAdjustments(input: {
  topics: string[]
  signals: string[]
  recentTools: Array<{ toolName: string; count: number }>
}) {
  const adjustments = new Set<string>()

  if (input.signals.some((signal) => /stuck|setup/.test(signal))) {
    adjustments.add('Begin with a small setup question before explaining.')
  }
  if (input.signals.some((signal) => /answer checking|rush/.test(signal))) {
    adjustments.add('Use answer checking and hints before final answers.')
  }
  if (input.topics.includes('fractions')) {
    adjustments.add('Use a visual fraction model before symbolic steps.')
  }
  if (input.topics.includes('ratios and rates')) {
    adjustments.add('Use a ratio table or double number line when possible.')
  }
  if (input.topics.includes('linear equations')) {
    adjustments.add('Ask which operation undoes the last step.')
  }
  if (input.recentTools.some((tool) => /graph|plot|coordinate/.test(tool.toolName))) {
    adjustments.add('Keep graph explanations tied to labeled board features.')
  }

  return [...adjustments].slice(0, 5)
}

export async function getLearnerContextUserId(input: {
  userId?: string | null
  sessionId?: string | null
}) {
  if (input.userId) return input.userId
  if (!input.sessionId) return null
  return getTutorSessionOwnerUserId(input.sessionId)
}

export async function getLearnerContextForUser(input: {
  userId: string
  sessionId?: string | null
}): Promise<LearnerContextResponse> {
  const sql = getNeonSql()
  const sessionId = input.sessionId && isTutorSessionId(input.sessionId) ? input.sessionId : null

  const sessionRows = await sql`
    SELECT
      s.id,
      s.started_at,
      s.active_seconds,
      s.grade_level,
      s.model_snapshot,
      first_message.content AS first_user_message,
      COALESCE(message_stats.message_count, 0)::int AS message_count
    FROM tutor_sessions s
    LEFT JOIN LATERAL (
      SELECT content
      FROM tutor_messages
      WHERE session_id = s.id AND role = 'user'
      ORDER BY created_at ASC
      LIMIT 1
    ) first_message ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS message_count
      FROM tutor_messages
      WHERE session_id = s.id
    ) message_stats ON true
    WHERE s.user_id = ${input.userId}
      AND (${sessionId}::uuid IS NULL OR s.id != ${sessionId}::uuid)
    ORDER BY s.started_at DESC
    LIMIT 6
  `

  const messageRows = await sql`
    SELECT role, content, created_at
    FROM tutor_messages
    WHERE user_id = ${input.userId}
      AND (${sessionId}::uuid IS NULL OR session_id != ${sessionId}::uuid)
    ORDER BY created_at DESC
    LIMIT 36
  `

  const toolRows = await sql`
    SELECT tool_name, COUNT(*)::int AS count
    FROM tutor_tool_events
    WHERE user_id = ${input.userId}
      AND (${sessionId}::uuid IS NULL OR session_id != ${sessionId}::uuid)
      AND status = 'completed'
    GROUP BY tool_name
    ORDER BY count DESC, tool_name ASC
    LIMIT 8
  `.catch(() => [])

  const diagnosticToolRows = await sql`
    SELECT tool_name, output_json, created_at
    FROM tutor_tool_events
    WHERE user_id = ${input.userId}
      AND (${sessionId}::uuid IS NULL OR session_id != ${sessionId}::uuid)
      AND status = 'completed'
      AND tool_name IN (
        'mistake_pattern_classifier',
        'misconception_diagnosis',
        'math_check_step',
        'session_mastery_snapshot'
      )
    ORDER BY created_at DESC
    LIMIT 36
  `.catch(() => [])

  const sessions = sessionRows as SessionSummaryRow[]
  const messages = messageRows as MessageRow[]
  const recentTools = (toolRows as ToolRow[]).map((row) => ({
    toolName: row.tool_name,
    count: Number(row.count ?? 0),
  }))
  const misconceptionTimeline = buildLearnerMisconceptionTimeline(diagnosticToolRows as DiagnosticToolRow[])
  const combinedText = [
    ...sessions.map((session) => session.first_user_message ?? ''),
    ...messages.map((message) => message.content),
  ].join('\n')
  const likelyTopics = uniqueInOrder(scoreTopics(combinedText)).slice(0, 5)
  const struggleSignals = uniqueInOrder(findStruggleSignals(combinedText)).slice(0, 5)
  const gradeLevels = uniqueInOrder(
    sessions.map((session) => session.grade_level?.trim() ?? '').filter(Boolean)
  ).slice(0, 4)
  const recentExcerpts = messages
    .slice()
    .reverse()
    .map((message) => ({
      role: message.role,
      content: compactExcerpt(message.content),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-6)
  const recentActiveMinutes = Math.round(
    sessions.reduce((total, session) => total + Number(session.active_seconds ?? 0), 0) / 60
  )
  const suggestedTutorAdjustments = buildSuggestedAdjustments({
    topics: likelyTopics,
    signals: struggleSignals,
    recentTools,
  })

  const responseWithoutInstruction = {
    hasHistory: sessions.length > 0 || messages.length > 0 || misconceptionTimeline.length > 0,
    recentSessionCount: sessions.length,
    recentActiveMinutes,
    gradeLevels,
    likelyTopics,
    struggleSignals,
    misconceptionTimeline,
    recentExcerpts,
    recentTools,
    suggestedTutorAdjustments,
  }

  return {
    ok: true,
    ...responseWithoutInstruction,
    instruction: buildLearnerInstruction(responseWithoutInstruction),
  }
}
