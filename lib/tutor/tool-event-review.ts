import type { UserRole } from '@/lib/school/profiles'

type ToolEventForReview = {
  eventType: string
  toolName: string
  status?: string | null
  input?: unknown
  output?: unknown
  metadata?: unknown
}

export type ToolEventReviewSummary = {
  headline: string
  details: string[]
}

const PRIVATE_CONTEXT_TOOLS = new Set([
  'curriculum_context',
  'curriculum_search',
  'learner_context',
  'adaptive_review_plan',
  'session_mastery_snapshot',
])

const GUARDRAIL_TOOLS = new Set([
  'answer_disclosure_gate',
  'safety_boundary_check',
  'tutor_turn_audit',
])

function parseDebugFlag(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.includes('1') || value.includes('true')
  return value === '1' || value === 'true'
}

export function shouldShowRawToolPayloads(role: UserRole | null | undefined, debugTools: string | string[] | undefined) {
  return role === 'admin' && parseDebugFlag(debugTools)
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

function formatToolName(toolName: string) {
  return toolName.replace(/_/g, ' ')
}

function formatValue(value: unknown) {
  return String(value).replace(/_/g, ' ')
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function countCanvasActions(output: unknown) {
  const parsed = parseMaybeJson(output)
  if (Array.isArray(parsed)) {
    return parsed.filter((item) => asRecord(item)?.type).length
  }

  const record = asRecord(parsed)
  const actions = record?.canvasActions
  if (Array.isArray(actions)) return actions.length

  return 0
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function summarizeToolEventForReview(event: ToolEventForReview): ToolEventReviewSummary {
  const toolLabel = formatToolName(event.toolName)

  if (event.eventType === 'tool_started') {
    return {
      headline: `${toolLabel} started.`,
      details: ['The input payload is hidden in normal review to keep internal traces and private context out of the session record.'],
    }
  }

  if (event.eventType === 'tool_failed') {
    return {
      headline: `${toolLabel} did not complete.`,
      details: ['The failed call was logged for audit, but raw error details are hidden in normal review.'],
    }
  }

  const output = parseMaybeJson(event.output)
  const outputRecord = asRecord(output)
  const details: string[] = []
  const canvasActionCount = countCanvasActions(output)

  if (canvasActionCount > 0) {
    details.push(`Board evidence: ${pluralize(canvasActionCount, 'structured canvas action')}.`)
  } else if (event.eventType === 'canvas_action') {
    details.push('Board evidence: a structured canvas action event was saved.')
  }

  if (PRIVATE_CONTEXT_TOOLS.has(event.toolName)) {
    details.push('Private learner or curriculum context was used; raw excerpts are hidden from normal review.')
  } else if (event.toolName === 'math_check_step') {
    const verdict = readString(outputRecord, 'verdict')
    const hintTarget = readString(outputRecord, 'hintTarget')
    if (verdict) details.push(`Step check result: ${formatValue(verdict)}.`)
    if (hintTarget) details.push(`Next tutor focus: ${hintTarget}.`)
  } else if (event.toolName === 'math_check_answer') {
    const verdict = readString(outputRecord, 'verdict')
    if (verdict) details.push(`Answer check result: ${formatValue(verdict)}.`)
  } else if (event.toolName === 'mistake_pattern_classifier') {
    const pattern = readString(outputRecord, 'primaryPattern')
    const severity = readString(outputRecord, 'severity')
    if (pattern) details.push(`Likely misconception: ${formatValue(pattern)}.`)
    if (severity) details.push(`Review priority: ${formatValue(severity)}.`)
  } else if (GUARDRAIL_TOOLS.has(event.toolName)) {
    const decision = readString(outputRecord, 'decision')
    const riskLevel = readString(outputRecord, 'riskLevel')
    const verdict = readString(outputRecord, 'verdict')
    details.push(
      decision
        ? `Tutor guardrail decision: ${formatValue(decision)}.`
        : riskLevel
          ? `Safety risk level: ${formatValue(riskLevel)}.`
          : verdict
            ? `Tutor audit result: ${formatValue(verdict)}.`
            : 'Tutor guardrail checked before the response continued.'
    )
  }

  if (details.length === 0) {
    details.push(`Saved as ${formatValue(event.status || 'completed')} tool evidence.`)
  }

  return {
    headline: `${toolLabel} ${event.eventType === 'canvas_action' ? 'updated the board' : 'completed'}.`,
    details,
  }
}
