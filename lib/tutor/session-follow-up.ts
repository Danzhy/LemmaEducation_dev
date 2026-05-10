import type { TutorSessionDetail } from '@/lib/tutor/history'
import { practiceSetGenerator } from '@/lib/voice-agent/math-engine'

type SessionLike = Pick<TutorSessionDetail, 'gradeLevel' | 'messages' | 'toolEvents'>

type CurriculumTopic =
  | 'place_value'
  | 'multiplication_division'
  | 'fractions'
  | 'decimals_percents'
  | 'ratios_rates'
  | 'expressions_equations'
  | 'geometry_measurement'
  | 'coordinate_graphing'
  | 'data_probability'

export type SessionFollowUpPractice = {
  topic: CurriculumTopic
  focusLabel: string
  rationale: string
  tutorMove: string
  items: Array<{
    prompt: string
    hint: string
    suggestedTool: string
  }>
}

const TOPIC_LABELS: Record<CurriculumTopic, string> = {
  place_value: 'Place value',
  multiplication_division: 'Multiplication and division',
  fractions: 'Fractions',
  decimals_percents: 'Decimals and percents',
  ratios_rates: 'Ratios and rates',
  expressions_equations: 'Expressions and equations',
  geometry_measurement: 'Geometry and measurement',
  coordinate_graphing: 'Coordinate graphing',
  data_probability: 'Data and probability',
}

const TOPIC_PATTERNS: Array<{ topic: CurriculumTopic; pattern: RegExp }> = [
  {
    topic: 'fractions',
    pattern: /\b(fraction|denominator|numerator|common denominator|equivalent|thirds?|fourths?|fifths?|sixths?|eighths?)\b/i,
  },
  {
    topic: 'decimals_percents',
    pattern: /\b(decimal|percent|percentage|hundredths?|tenths?|discount|tax|tip|0\.\d+|%)\b/i,
  },
  {
    topic: 'ratios_rates',
    pattern: /\b(ratio|rate|unit rate|proportion|scale factor|per\b|recipe|speed|conversion|convert)\b/i,
  },
  {
    topic: 'expressions_equations',
    pattern: /\b(equation|expression|variable|unknown|solve|like terms|coefficient|x\s*[+\-=]|=\s*\d)\b/i,
  },
  {
    topic: 'geometry_measurement',
    pattern: /\b(area|perimeter|volume|angle|triangle|rectangle|circle|polygon|length|width|height)\b/i,
  },
  {
    topic: 'coordinate_graphing',
    pattern: /\b(graph|coordinate|ordered pair|x-axis|y-axis|slope|plot|point|quadrant)\b/i,
  },
  {
    topic: 'data_probability',
    pattern: /\b(mean|median|mode|range|data|probability|chance|outcome|bar graph|line plot)\b/i,
  },
  {
    topic: 'place_value',
    pattern: /\b(place value|digit|round|expanded form|ones|tens|hundreds|thousands)\b/i,
  },
  {
    topic: 'multiplication_division',
    pattern: /\b(multiply|multiplication|divide|division|product|quotient|factor|remainder|groups?)\b/i,
  },
]

const MISTAKE_TOPIC_MAP: Array<{ pattern: RegExp; topic: CurriculumTopic; label: string }> = [
  { pattern: /denominator|fraction|whole/i, topic: 'fractions', label: 'Fractions' },
  { pattern: /decimal|percent|place value/i, topic: 'decimals_percents', label: 'Decimals and percents' },
  { pattern: /ratio|rate|scale/i, topic: 'ratios_rates', label: 'Ratios and rates' },
  { pattern: /equality|unknown|equation|like terms|sign/i, topic: 'expressions_equations', label: 'Expressions and equations' },
  { pattern: /area|perimeter|angle|measurement/i, topic: 'geometry_measurement', label: 'Geometry and measurement' },
  { pattern: /coordinate|slope|graph/i, topic: 'coordinate_graphing', label: 'Coordinate graphing' },
  { pattern: /probability|data|mean|median|mode/i, topic: 'data_probability', label: 'Data and probability' },
]

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

function cleanReviewText(value: string, maxLength = 120) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`
}

function inferTopicFromText(text: string): CurriculumTopic | null {
  for (const { topic, pattern } of TOPIC_PATTERNS) {
    if (pattern.test(text)) return topic
  }

  return null
}

function defaultTopicForGrade(gradeLevel: string | null) {
  const grade = Number(gradeLevel?.match(/\d+/)?.[0])
  if (Number.isFinite(grade) && grade <= 4) return 'multiplication_division' satisfies CurriculumTopic
  return 'expressions_equations' satisfies CurriculumTopic
}

function inferFromToolEvents(events: SessionLike['toolEvents']) {
  for (const event of [...events].reverse()) {
    if (event.eventType !== 'tool_completed') continue

    const output = asRecord(parseMaybeJson(event.output))

    if (event.toolName === 'session_mastery_snapshot') {
      const label = readString(output, 'label') ?? readString(output, 'topic')
      const needsReview = readStringList(output, 'needsReview')
      const combined = [label, ...needsReview].filter(Boolean).join(' ')
      const topic = inferTopicFromText(combined)
      if (topic) {
        return {
          topic,
          focusLabel: label ? cleanReviewText(label, 60) : TOPIC_LABELS[topic],
          rationale: 'Based on the saved mastery snapshot, this is the most useful next review.',
        }
      }
    }

    if (event.toolName === 'math_check_step') {
      const verdict = readString(output, 'verdict')?.toLowerCase()
      const hintTarget = readString(output, 'hintTarget')
      if ((verdict === 'invalid' || verdict === 'unclear') && hintTarget) {
        const topic = inferTopicFromText(hintTarget)
        if (topic) {
          return {
            topic,
            focusLabel: cleanReviewText(hintTarget, 60),
            rationale: 'Based on the last step check, the next practice should revisit this reasoning move.',
          }
        }
      }
    }

    if (event.toolName === 'mistake_pattern_classifier') {
      const primaryPattern = readString(output, 'primaryPattern')
      const evidence = [primaryPattern, readString(output, 'hintTarget')]
        .filter(Boolean)
        .join(' ')
      const mapped = MISTAKE_TOPIC_MAP.find((entry) => entry.pattern.test(evidence))
      if (mapped) {
        return {
          topic: mapped.topic,
          focusLabel: mapped.label,
          rationale: 'Based on the misconception signal, start with a short targeted check.',
        }
      }
    }
  }

  return null
}

function inferFromTranscript(messages: SessionLike['messages']) {
  const recentStudentText = messages
    .filter((message) => message.role === 'user')
    .slice(-4)
    .map((message) => message.content)
    .join(' ')

  if (!recentStudentText.trim()) return null

  const topic = inferTopicFromText(recentStudentText)
  if (!topic) return null

  return {
    topic,
    focusLabel: TOPIC_LABELS[topic],
    rationale: 'Based on the student prompts in the transcript, this topic is the safest follow-up.',
  }
}

export function buildSessionFollowUpPractice(session: SessionLike): SessionFollowUpPractice | null {
  if (session.messages.length === 0 && session.toolEvents.length === 0) return null

  const inferred =
    inferFromToolEvents(session.toolEvents) ??
    inferFromTranscript(session.messages) ?? {
      topic: defaultTopicForGrade(session.gradeLevel),
      focusLabel: 'Mixed reasoning check',
      rationale: 'No narrow misconception was saved, so begin with a short grade-level reasoning check.',
    }

  const invalidOrUnclearStepCount = session.toolEvents.filter((event) => {
    if (event.toolName !== 'math_check_step' || event.eventType !== 'tool_completed') return false
    const output = asRecord(parseMaybeJson(event.output))
    const verdict = readString(output, 'verdict')?.toLowerCase()
    return verdict === 'invalid' || verdict === 'unclear'
  }).length

  const difficulty = invalidOrUnclearStepCount > 0 ? 'support' : 'core'
  const practice = practiceSetGenerator({
    topic: inferred.topic,
    difficulty,
    count: 3,
  })

  return {
    topic: inferred.topic,
    focusLabel: inferred.focusLabel,
    rationale: inferred.rationale,
    tutorMove: 'Use one prompt at a time. Let the student try before offering another hint.',
    items: practice.items.map((item) => ({
      prompt: item.prompt,
      hint: item.hint,
      suggestedTool: item.suggestedTool,
    })),
  }
}
