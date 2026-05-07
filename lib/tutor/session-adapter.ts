import type { TutorState } from '@/components/TutorAvatar'

export type TutorConnectOptions = {
  language?: string
  gradeLevel?: string
  audioMode?: 'microphone' | 'silent'
}

export type TutorUserMessageSource =
  | 'text'
  | 'text_with_image'
  | 'image_only'
  | 'speech'

export type TutorChatMessage = {
  role: 'user' | 'assistant'
  content: string
  source?: TutorUserMessageSource | 'assistant' | null
}

export type TutorToolEvent = {
  id: string
  type: 'tool_started' | 'tool_completed' | 'tool_failed' | 'canvas_action'
  toolName: string
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
  createdAt: number
}

export type TutorCanvasColor =
  | 'black'
  | 'grey'
  | 'blue'
  | 'green'
  | 'red'
  | 'yellow'
  | 'orange'
  | 'violet'
  | 'light-blue'
  | 'light-red'
  | 'light-green'

export type TutorCanvasDash = 'draw' | 'dashed' | 'dotted' | 'solid'
export type TutorCanvasSize = 's' | 'm' | 'l' | 'xl'
export type TutorCanvasLabelPosition =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type TutorCanvasAction =
  | {
      id: string
      type: 'clear_tool_layer'
    }
  | {
      id: string
      type: 'focus_region'
      x: number
      y: number
      width: number
      height: number
    }
  | {
      id: string
      type: 'place_text_label'
      x: number
      y: number
      text: string
      width?: number
      color?: TutorCanvasColor
    }
  | {
      id: string
      type: 'place_math_block'
      x: number
      y: number
      latex: string
      displayMode?: boolean
      width?: number
      height?: number
    }
  | {
      id: string
      type: 'place_point'
      x: number
      y: number
      label?: string
      color?: TutorCanvasColor
      labelPosition?: TutorCanvasLabelPosition
      labelWidth?: number
    }
  | {
      id: string
      type: 'draw_line_segment'
      start: { x: number; y: number }
      end: { x: number; y: number }
      label?: string
      color?: TutorCanvasColor
      dash?: TutorCanvasDash
      size?: TutorCanvasSize
    }
  | {
      id: string
      type: 'draw_axes'
      origin: { x: number; y: number }
      xLength: number
      yLength: number
      xLabel?: string
      yLabel?: string
      color?: TutorCanvasColor
      dash?: TutorCanvasDash
      size?: TutorCanvasSize
    }
  | {
      id: string
      type: 'draw_rectangle'
      x: number
      y: number
      width: number
      height: number
      color?: TutorCanvasColor
      dash?: TutorCanvasDash
      size?: TutorCanvasSize
      fill?: 'none' | 'semi' | 'solid'
      opacity?: number
      label?: string
    }
  | {
      id: string
      type: 'plot_polyline'
      points: Array<{ x: number; y: number }>
      label?: string
      color?: TutorCanvasColor
      dash?: TutorCanvasDash
      size?: TutorCanvasSize
    }
  | {
      id: string
      type: 'highlight_region'
      x: number
      y: number
      width: number
      height: number
      label?: string
      color?: TutorCanvasColor
      opacity?: number
    }

export type TutorSessionAdapter = {
  state: TutorState
  isConnected: boolean
  isPaused: boolean
  lastPauseReason: 'manual' | 'inactivity' | null
  isMuted: boolean
  isSpeakerMuted: boolean
  supportsLiveMic?: boolean
  connectionMode?: 'voice' | 'typed'
  currentSessionId: string | null
  currentUserTranscript: string
  transcript: string
  chatHistory: TutorChatMessage[]
  toolEvents: TutorToolEvent[]
  pendingCanvasActions: TutorCanvasAction[]
  connect: (options?: TutorConnectOptions) => Promise<void>
  disconnect: (endedReason?: 'user' | 'error' | 'quota') => void
  sendText: (text: string) => void
  sendImage: (base64Data: string, mimeType: string) => void
  sendTextWithImage: (text: string, base64Data: string, mimeType: string) => void
  sendCanvasImage: (base64: string, mimeType?: string) => void
  mute: () => void
  unmute: () => void
  pause: (reason?: 'manual' | 'inactivity', skipServerSync?: boolean) => Promise<void> | void
  resume: () => Promise<void>
  muteSpeaker: () => void
  unmuteSpeaker: () => void
  acknowledgeCanvasAction?: (actionId: string) => void
}
