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

export type SessionEvidenceReviewSummary = {
  headline: string
  details: string[]
}

const PRIVATE_CONTEXT_TOOLS = new Set([
  'curriculum_context',
  'curriculum_search',
  'learner_context',
  'adaptive_review_plan',
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

function cleanReviewText(value: string, maxLength = 180) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`
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

function pushUnique(values: string[], value: string | null | undefined, maxItems = 3) {
  if (!value || values.length >= maxItems) return
  const cleaned = cleanReviewText(value)
  if (!cleaned || values.includes(cleaned)) return
  values.push(cleaned)
}

export function summarizeSessionEvidenceForReview(
  events: ToolEventForReview[]
): SessionEvidenceReviewSummary | null {
  let validStepChecks = 0
  let invalidStepChecks = 0
  let unclearStepChecks = 0
  let boardActionCount = 0
  const focusAreas: string[] = []
  const misconceptionSignals: string[] = []
  const masterySignals: string[] = []
  const nextTutorMoves: string[] = []

  for (const event of events) {
    if (event.eventType !== 'tool_completed' && event.eventType !== 'canvas_action') continue

    boardActionCount += countCanvasActions(event.output)
    const output = parseMaybeJson(event.output)
    const outputRecord = asRecord(output)

    if (event.toolName === 'math_check_step') {
      const verdict = readString(outputRecord, 'verdict')?.toLowerCase()
      const hintTarget = readString(outputRecord, 'hintTarget')

      if (verdict === 'valid') {
        validStepChecks += 1
      } else if (verdict === 'invalid') {
        invalidStepChecks += 1
        pushUnique(focusAreas, hintTarget)
      } else if (verdict === 'unclear') {
        unclearStepChecks += 1
        pushUnique(focusAreas, hintTarget)
      }
    } else if (event.toolName === 'mistake_pattern_classifier') {
      const pattern = readString(outputRecord, 'primaryPattern')
      const severity = readString(outputRecord, 'severity')
      if (pattern) {
        pushUnique(
          misconceptionSignals,
          severity ? `${formatValue(pattern)} (${formatValue(severity)} priority)` : formatValue(pattern)
        )
      }
    } else if (event.toolName === 'session_mastery_snapshot') {
      const label = readString(outputRecord, 'label') ?? readString(outputRecord, 'topic')
      const confidence = readString(outputRecord, 'confidence')
      const needsReview = readStringList(outputRecord, 'needsReview')
      const suggestedNextTutorMove = readString(outputRecord, 'suggestedNextTutorMove')

      if (label) {
        pushUnique(
          masterySignals,
          confidence ? `${label}: ${formatValue(confidence)} confidence` : label
        )
      }
      pushUnique(focusAreas, needsReview[0])
      pushUnique(nextTutorMoves, suggestedNextTutorMove, 2)
    }
  }

  const stepCheckCount = validStepChecks + invalidStepChecks + unclearStepChecks
  const evidenceCount =
    stepCheckCount + misconceptionSignals.length + masterySignals.length + boardActionCount

  if (evidenceCount === 0) return null

  const details: string[] = []

  if (stepCheckCount > 0) {
    const parts = [
      validStepChecks > 0 ? `${validStepChecks} valid` : null,
      invalidStepChecks > 0 ? `${invalidStepChecks} needs review` : null,
      unclearStepChecks > 0 ? `${unclearStepChecks} unclear` : null,
    ].filter(Boolean)
    details.push(`Step checks: ${parts.join(', ')}.`)
  }

  if (misconceptionSignals.length > 0) {
    details.push(`Misconception signals: ${misconceptionSignals.join('; ')}.`)
  }

  if (masterySignals.length > 0) {
    details.push(`Mastery snapshots: ${masterySignals.join('; ')}.`)
  }

  if (focusAreas.length > 0) {
    details.push(`Review focus: ${focusAreas.join('; ')}.`)
  }

  if (nextTutorMoves.length > 0) {
    details.push(`Next tutor move: ${nextTutorMoves.join('; ')}.`)
  }

  if (boardActionCount > 0) {
    details.push(`Board evidence: ${pluralize(boardActionCount, 'structured canvas action')}.`)
  }

  details.push('Raw tool inputs, private learner context, curriculum excerpts, and full debug payloads stay hidden in normal review.')

  const headlineParts = [
    stepCheckCount > 0 ? pluralize(stepCheckCount, 'step check') : null,
    misconceptionSignals.length > 0 ? pluralize(misconceptionSignals.length, 'misconception signal') : null,
    masterySignals.length > 0 ? pluralize(masterySignals.length, 'mastery snapshot') : null,
    boardActionCount > 0 ? pluralize(boardActionCount, 'board action') : null,
  ].filter(Boolean)

  return {
    headline: `Session evidence from ${headlineParts.join(', ')}.`,
    details,
  }
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
  } else if (event.toolName === 'session_mastery_snapshot') {
    const label = readString(outputRecord, 'label') ?? readString(outputRecord, 'topic')
    const confidence = readString(outputRecord, 'confidence')
    const teacherReviewNote = readString(outputRecord, 'teacherReviewNote')
    const suggestedNextTutorMove = readString(outputRecord, 'suggestedNextTutorMove')
    const needsReview = readStringList(outputRecord, 'needsReview')

    if (label) details.push(`Learning focus: ${label}.`)
    if (confidence) details.push(`Mastery signal: ${formatValue(confidence)} confidence.`)
    if (needsReview.length > 0) {
      details.push(`Review need: ${needsReview[0]}.`)
    } else {
      details.push('Review need: none flagged by the snapshot.')
    }
    if (teacherReviewNote) details.push(`Teacher note: ${teacherReviewNote}`)
    if (suggestedNextTutorMove) details.push(`Next tutor move: ${suggestedNextTutorMove}`)
    details.push('Raw transcript, student work, and tool payloads remain hidden in normal review.')
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
