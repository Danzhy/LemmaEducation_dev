import type { TutorChatMessage, TutorToolEvent } from '@/lib/tutor/session-adapter'
import { TUTOR_SILENT_BOARD_CONTEXT_MARKER } from '@/lib/tutor/silent-board-context'

export const LIVEKIT_TOPICS = {
  userText: 'lemma.user.text',
  userImage: 'lemma.user.image',
  canvasContext: 'lemma.canvas.context',
  assistantText: 'lemma.assistant.text',
  toolEvent: 'lemma.tool.event',
  canvasAction: 'lemma.canvas.action',
  control: 'lemma.control',
} as const

export type LiveKitTutorPayload =
  | {
      type: 'user_text'
      text: string
      boardDescription?: string
      sessionId: string | null
      createdAt: number
    }
  | {
      type: 'user_image'
      text?: string
      mimeType: string
      dataBase64: string
      sessionId: string | null
      createdAt: number
    }
  | {
      type: 'canvas_context'
      mimeType: string
      dataBase64: string
      sessionId: string | null
      createdAt: number
    }
  | {
      type: 'assistant_text'
      text: string
      final?: boolean
      createdAt: number
    }
  | {
      type: 'tool_event'
      event: Omit<TutorToolEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
    }
  | {
      type: 'chat_message'
      message: TutorChatMessage
      createdAt: number
    }

export function encodeLiveKitPayload(payload: LiveKitTutorPayload) {
  return new TextEncoder().encode(JSON.stringify(payload))
}

export function decodeLiveKitPayload(payload: Uint8Array) {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as LiveKitTutorPayload
  } catch {
    return null
  }
}

const STUDENT_VISIBLE_ASSISTANT_TEXT_BLOCKLIST = [
  TUTOR_SILENT_BOARD_CONTEXT_MARKER,
  'Visible board summary:',
  'Tool visuals:',
  'lemma.canvas.context',
  'lemma.tool.event',
  '"type":"tool_event"',
  '"type": "tool_event"',
  '"toolName"',
  '"canvasActions"',
  '"boardDescription"',
]

export function sanitizeLiveKitAssistantTextForStudent(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  const compact = trimmed.replace(/\s+/g, ' ')
  const compactLower = compact.toLowerCase()
  const leaksHiddenPayload = STUDENT_VISIBLE_ASSISTANT_TEXT_BLOCKLIST.some((pattern) =>
    compactLower.includes(pattern.toLowerCase())
  )
  return leaksHiddenPayload ? '' : trimmed
}

export function coerceLiveKitAssistantText(parsed: LiveKitTutorPayload | null, rawText: string) {
  if (parsed?.type === 'assistant_text') {
    return sanitizeLiveKitAssistantTextForStudent(parsed.text)
  }

  if (parsed?.type === 'chat_message' && parsed.message.role === 'assistant') {
    return sanitizeLiveKitAssistantTextForStudent(parsed.message.content)
  }

  if (parsed) return ''
  return sanitizeLiveKitAssistantTextForStudent(rawText)
}
