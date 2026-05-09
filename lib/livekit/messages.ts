import type { TutorChatMessage, TutorToolEvent } from '@/lib/tutor/session-adapter'

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
