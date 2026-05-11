export const TUTOR_SILENT_BOARD_CONTEXT_MARKER = 'LEMMA_CANVAS_CONTEXT'

const MAX_SILENT_BOARD_CONTEXT_CHARS = 2400

type TutorMessagePart = Record<string, unknown>

type StripSilentBoardContextOptions = {
  preserveVisibleMessages?: boolean
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength: number) {
  const cleaned = cleanText(value)
  if (cleaned.length <= maxLength) return cleaned
  if (maxLength <= 3) return cleaned.slice(0, Math.max(0, maxLength)).trim()
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}

export function isSilentTutorBoardContextText(value: unknown) {
  return typeof value === 'string' && value.includes(TUTOR_SILENT_BOARD_CONTEXT_MARKER)
}

export function buildSilentTutorBoardContext(boardDescription: string | null | undefined) {
  const cleaned = truncate(boardDescription ?? '', MAX_SILENT_BOARD_CONTEXT_CHARS)
  if (!cleaned) return ''

  return [
    `${TUTOR_SILENT_BOARD_CONTEXT_MARKER}: Latest structured board summary.`,
    'Use this only as silent tutoring context when the student references the board, diagram, canvas, or visible work. Do not quote it in chat.',
    cleaned,
  ].join('\n\n')
}

export function extractTutorVisibleMessageText(content: unknown) {
  const parts = Array.isArray(content) ? content : []
  const textParts: string[] = []
  let hasImage = false
  let hasAudio = false
  let hasSilentContext = false

  for (const part of parts as TutorMessagePart[]) {
    if (part?.type === 'input_text' && typeof part.text === 'string') {
      if (isSilentTutorBoardContextText(part.text)) {
        hasSilentContext = true
      } else {
        textParts.push(part.text)
      }
    }
    if (part?.type === 'input_audio') {
      hasAudio = true
      if (typeof part.transcript === 'string' && part.transcript.trim()) {
        if (isSilentTutorBoardContextText(part.transcript)) {
          hasSilentContext = true
        } else {
          textParts.push(part.transcript.trim())
        }
      }
    }
    if (part?.type === 'output_text' && typeof part.text === 'string') {
      if (isSilentTutorBoardContextText(part.text)) {
        hasSilentContext = true
      } else {
        textParts.push(part.text)
      }
    }
    if (part?.type === 'output_audio' && typeof part.transcript === 'string' && part.transcript.trim()) {
      if (isSilentTutorBoardContextText(part.transcript)) {
        hasSilentContext = true
      } else {
        textParts.push(part.transcript.trim())
      }
    }
    if (part?.type === 'input_image') {
      hasImage = true
    }
  }

  return {
    joined: textParts.join('\n').trim(),
    hasImage,
    hasAudio,
    hasSilentContext,
  }
}

export function stripSilentTutorBoardContextParts<T extends { content?: unknown }>(
  message: T,
  options: StripSilentBoardContextOptions = {}
) {
  if (!Array.isArray(message.content)) return message

  let removedContext = false
  const content = message.content.filter((part) => {
    if (
      typeof part === 'object' &&
      part != null &&
      'type' in part &&
      (part as TutorMessagePart).type === 'input_text' &&
      isSilentTutorBoardContextText((part as TutorMessagePart).text)
    ) {
      removedContext = true
      return false
    }

    return true
  })

  if (!removedContext) return message

  const visible = extractTutorVisibleMessageText(content)
  if (!visible.joined && !visible.hasAudio) return null
  if (options.preserveVisibleMessages) return { ...message, content }

  return {
    ...message,
    content,
  }
}
