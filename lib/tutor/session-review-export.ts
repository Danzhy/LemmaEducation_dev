import type { TutorSessionDetail } from '@/lib/tutor/history'
import { buildSessionFollowUpPractice } from '@/lib/tutor/session-follow-up'
import { summarizeSessionEvidenceForReview } from '@/lib/tutor/tool-event-review'

type SessionForReviewExport = Pick<
  TutorSessionDetail,
  | 'id'
  | 'startedAt'
  | 'endedAt'
  | 'activeSeconds'
  | 'endedReason'
  | 'modelSnapshot'
  | 'language'
  | 'gradeLevel'
  | 'userMessageCount'
  | 'assistantMessageCount'
  | 'hasCanvasSnapshot'
  | 'artifactUpdatedAt'
  | 'messages'
  | 'toolEvents'
>

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '0 minutes'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`
  }

  return `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'}`
}

function formatDate(value: Date | null) {
  return value ? value.toISOString() : 'Not recorded'
}

function cleanMarkdownLine(value: string, maxLength = 220) {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()

  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`
}

function bullet(value: string) {
  return `- ${cleanMarkdownLine(value)}`
}

export function buildSessionReviewMarkdown(session: SessionForReviewExport) {
  const evidenceSummary = summarizeSessionEvidenceForReview(session.toolEvents)
  const followUpPractice = buildSessionFollowUpPractice(session)
  const studentMessageCount =
    session.messages.filter((message) => message.role === 'user').length || session.userMessageCount
  const tutorMessageCount =
    session.messages.filter((message) => message.role === 'assistant').length || session.assistantMessageCount

  const lines: string[] = [
    '# Lemma Session Review',
    '',
    'This export is a teacher-safe summary. It does not include raw tool payloads, private curriculum excerpts, or hidden debug traces.',
    '',
    '## Session',
    bullet(`Session ID: ${session.id}`),
    bullet(`Started: ${formatDate(session.startedAt)}`),
    bullet(`Ended: ${formatDate(session.endedAt)}`),
    bullet(`Practice time: ${formatDuration(session.activeSeconds)}`),
    bullet(`Level: ${session.gradeLevel ?? 'Not set'}`),
    bullet(`Language: ${session.language || 'en'}`),
    bullet(`Student messages: ${studentMessageCount}`),
    bullet(`Tutor messages: ${tutorMessageCount}`),
  ]

  if (session.endedReason) {
    lines.push(bullet(`Ended reason: ${session.endedReason.replace(/_/g, ' ')}`))
  }

  if (session.modelSnapshot) {
    lines.push(bullet(`Model snapshot: ${session.modelSnapshot}`))
  }

  lines.push('', '## Learning Evidence')

  if (evidenceSummary) {
    lines.push(cleanMarkdownLine(evidenceSummary.headline))
    lines.push('', ...evidenceSummary.details.map(bullet))
  } else {
    lines.push('No structured learning evidence was saved for this session.')
  }

  lines.push('', '## Follow-up Practice')

  if (followUpPractice) {
    lines.push(bullet(`Focus: ${followUpPractice.focusLabel}`))
    lines.push(bullet(followUpPractice.rationale))
    lines.push('')
    followUpPractice.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${cleanMarkdownLine(item.prompt)}`)
      lines.push(`   Hint: ${cleanMarkdownLine(item.hint)}`)
    })
    lines.push('', cleanMarkdownLine(followUpPractice.tutorMove))
  } else {
    lines.push('No follow-up practice was generated because no transcript or tool evidence was saved.')
  }

  lines.push('', '## Board')
  if (session.hasCanvasSnapshot) {
    lines.push(
      bullet(
        `A final board snapshot was saved${session.artifactUpdatedAt ? ` at ${formatDate(session.artifactUpdatedAt)}` : ''}.`
      )
    )
  } else {
    lines.push('No final board snapshot was saved.')
  }

  lines.push('', '## Privacy Note')
  lines.push(
    'Full transcripts and board images should only be viewed inside Lemma by authorized students, guardians, teachers, or administrators.'
  )

  return `${lines.join('\n')}\n`
}

export function buildSessionReviewFilename(sessionId: string) {
  const safePrefix = sessionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12) || 'session'
  return `lemma-session-${safePrefix}-review.md`
}
