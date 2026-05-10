import { practiceSetGenerator } from '@/lib/voice-agent/math-engine'

type DraftTopic =
  | 'place_value'
  | 'multiplication_division'
  | 'fractions'
  | 'decimals_percents'
  | 'ratios_rates'
  | 'expressions_equations'
  | 'geometry_measurement'
  | 'coordinate_graphing'
  | 'data_probability'

export type FollowUpAssignmentDraft = {
  title: string
  focusLabel: string
  topic: DraftTopic
  estimatedMinutes: number
  teacherNote: string
  studentDirections: string
  items: Array<{
    prompt: string
    hint: string
    suggestedTool: string
  }>
}

const TOPIC_MATCHERS: Array<{ topic: DraftTopic; pattern: RegExp }> = [
  { topic: 'fractions', pattern: /\b(fraction|denominator|numerator|whole|equivalent|common denominator)\b/i },
  { topic: 'decimals_percents', pattern: /\b(decimal|percent|percentage|tenths?|hundredths?|discount|tax|tip|%)\b/i },
  { topic: 'ratios_rates', pattern: /\b(ratio|rate|unit rate|scale|proportion|conversion|per\b)\b/i },
  { topic: 'expressions_equations', pattern: /\b(equation|expression|unknown|variable|like terms|solve|coefficient|sign)\b/i },
  { topic: 'geometry_measurement', pattern: /\b(area|perimeter|volume|angle|triangle|rectangle|measurement|length|width|height)\b/i },
  { topic: 'coordinate_graphing', pattern: /\b(graph|coordinate|slope|plot|point|axis|ordered pair)\b/i },
  { topic: 'data_probability', pattern: /\b(mean|median|mode|range|probability|data|chance|outcome)\b/i },
  { topic: 'place_value', pattern: /\b(place value|round|digit|expanded form|ones|tens|hundreds)\b/i },
  { topic: 'multiplication_division', pattern: /\b(multiply|divide|product|quotient|factor|remainder|groups?)\b/i },
]

function cleanFocus(value: string) {
  const cleaned = value
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || /private|scratch|transcript|family|answer key|teacher-only/i.test(cleaned)) {
    return null
  }

  return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 71).trimEnd()}...`
}

function inferTopic(focusLabel: string, gradeLevel?: string | null): DraftTopic {
  for (const matcher of TOPIC_MATCHERS) {
    if (matcher.pattern.test(focusLabel)) return matcher.topic
  }

  const grade = Number(gradeLevel?.match(/\d+/)?.[0])
  if (Number.isFinite(grade) && grade <= 4) return 'multiplication_division'
  return 'expressions_equations'
}

export function buildFollowUpAssignmentDraft(input: {
  focusLabel: string
  gradeLevel?: string | null
  itemCount?: number
}): FollowUpAssignmentDraft | null {
  const focusLabel = cleanFocus(input.focusLabel)
  if (!focusLabel) return null

  const topic = inferTopic(focusLabel, input.gradeLevel)
  const practice = practiceSetGenerator({
    topic,
    difficulty: 'support',
    count: input.itemCount ?? 3,
  })

  return {
    title: `${focusLabel} review`,
    focusLabel,
    topic,
    estimatedMinutes: Math.max(6, practice.items.length * 3),
    teacherNote:
      'Use this as a short follow-up. Let the student attempt each item before showing another hint.',
    studentDirections:
      'Try each problem on the board. Explain your reasoning out loud before asking for help.',
    items: practice.items.map((item) => ({
      prompt: item.prompt,
      hint: item.hint,
      suggestedTool: item.suggestedTool,
    })),
  }
}
