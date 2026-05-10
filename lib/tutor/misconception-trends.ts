export type MisconceptionTrendEvent = {
  eventType: string
  toolName: string
  status?: string | null
  output?: unknown
  createdAt?: Date | string | null
}

export type StudentMisconceptionTrends = {
  summary: string
  focusAreas: Array<{
    label: string
    count: number
    priority: 'watch' | 'review' | 'urgent'
    lastSeenAt: Date | null
  }>
  lastSignalAt: Date | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readStringList(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function normalizeLabel(value: string) {
  const cleaned = value
    .replace(/_/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || /private|scratch|transcript|family|answer key|teacher-only/i.test(cleaned)) {
    return null
  }

  return cleaned.length <= 76 ? cleaned : `${cleaned.slice(0, 75).trimEnd()}...`
}

function priorityFrom(score: number, count: number): StudentMisconceptionTrends['focusAreas'][number]['priority'] {
  if (score >= 3 || count >= 3) return 'urgent'
  if (score >= 2 || count >= 2) return 'review'
  return 'watch'
}

function labelFromEvent(event: MisconceptionTrendEvent) {
  if (event.eventType !== 'tool_completed' || event.status === 'failed') return null

  const output = asRecord(parseMaybeJson(event.output))

  if (event.toolName === 'mistake_pattern_classifier') {
    const pattern = readString(output, 'primaryPattern')
    return {
      label: pattern ? normalizeLabel(pattern) : null,
      score: readString(output, 'severity')?.toLowerCase() === 'high' ? 3 : 2,
    }
  }

  if (event.toolName === 'misconception_diagnosis') {
    const topic = readString(output, 'topic')
    const misconception = readString(output, 'misconception') ?? readString(output, 'primaryPattern')
    return {
      label: normalizeLabel(misconception ?? topic ?? ''),
      score: 2,
    }
  }

  if (event.toolName === 'math_check_step') {
    const verdict = readString(output, 'verdict')?.toLowerCase()
    if (verdict !== 'invalid' && verdict !== 'unclear') return null

    return {
      label: normalizeLabel(readString(output, 'hintTarget') ?? 'Step needs review'),
      score: verdict === 'invalid' ? 2 : 1,
    }
  }

  if (event.toolName === 'session_mastery_snapshot') {
    const needsReview = readStringList(output, 'needsReview')
    const label = readString(output, 'label') ?? readString(output, 'topic')
    return {
      label: normalizeLabel(needsReview[0] ?? label ?? ''),
      score: readString(output, 'confidence')?.toLowerCase() === 'low' ? 3 : 1,
    }
  }

  return null
}

export function buildStudentMisconceptionTrends(
  events: MisconceptionTrendEvent[]
): StudentMisconceptionTrends {
  const buckets = new Map<
    string,
    {
      label: string
      count: number
      score: number
      lastSeenAt: Date | null
    }
  >()
  let lastSignalAt: Date | null = null

  for (const event of events) {
    const signal = labelFromEvent(event)
    if (!signal?.label) continue

    const seenAt = asDate(event.createdAt)
    if (seenAt && (!lastSignalAt || seenAt > lastSignalAt)) {
      lastSignalAt = seenAt
    }

    const key = signal.label.toLowerCase()
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.score = Math.max(bucket.score, signal.score)
      if (seenAt && (!bucket.lastSeenAt || seenAt > bucket.lastSeenAt)) {
        bucket.lastSeenAt = seenAt
      }
    } else {
      buckets.set(key, {
        label: signal.label,
        count: 1,
        score: signal.score,
        lastSeenAt: seenAt,
      })
    }
  }

  const focusAreas = Array.from(buckets.values())
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map((bucket) => ({
      label: bucket.label,
      count: bucket.count,
      priority: priorityFrom(bucket.score, bucket.count),
      lastSeenAt: bucket.lastSeenAt,
    }))

  return {
    summary:
      focusAreas.length > 0
        ? `${focusAreas.length} recent learning focus${focusAreas.length === 1 ? '' : 'es'} found.`
        : 'No structured misconception trends saved yet.',
    focusAreas,
    lastSignalAt,
  }
}
