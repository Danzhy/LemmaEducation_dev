'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { OpenAIRealtimeWebRTC, RealtimeAgent, RealtimeSession } from '@openai/agents/realtime'
import type { RealtimeItem } from '@openai/agents/realtime'
import type { TutorState } from '@/components/TutorAvatar'
import { assignCanvasArtifactIds, normalizeCanvasArtifactId } from '@/lib/tutor/canvas-action-artifacts'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'
import {
  TUTOR_SILENT_BOARD_CONTEXT_MARKER,
  buildSilentTutorBoardContext,
  extractTutorVisibleMessageText,
  stripSilentTutorBoardContextParts,
} from '@/lib/tutor/silent-board-context'
import type {
  TutorConnectOptions,
  TutorCanvasAction,
  TutorCanvasColor,
  TutorCanvasDash,
  TutorCanvasLabelPosition,
  TutorCanvasSize,
  TutorChatMessage,
  TutorSendTextOptions,
  TutorSessionAdapter,
  TutorToolEvent,
} from '@/lib/tutor/session-adapter'
import { createVoiceAgentTools } from '@/lib/voice-agent/tools'

type UseVoiceAgentTutorOptions = {
  onError?: (userMessage: string, rawError?: string) => void
}

const MAX_TOOL_EVENTS = 80
const MAX_PENDING_CANVAS_ACTIONS = 160
const MAX_CANVAS_ACTIONS_PER_TOOL_RESULT = 80

const CANVAS_COLORS = [
  'black',
  'grey',
  'blue',
  'green',
  'red',
  'yellow',
  'orange',
  'violet',
  'light-blue',
  'light-red',
  'light-green',
] as const satisfies readonly TutorCanvasColor[]

const CANVAS_DASHES = ['draw', 'dashed', 'dotted', 'solid'] as const satisfies readonly TutorCanvasDash[]
const CANVAS_SIZES = ['s', 'm', 'l', 'xl'] as const satisfies readonly TutorCanvasSize[]
const CANVAS_FILLS = ['none', 'semi', 'solid'] as const
const CANVAS_LABEL_POSITIONS = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const satisfies readonly TutorCanvasLabelPosition[]

function logErrorToServer(source: string, rawError?: string) {
  void fetch('/api/realtime/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, rawError: rawError ?? source }),
  }).catch(() => {})
}

function parseJsonSafely(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractCompletedText(item: Record<string, any>) {
  return extractTutorVisibleMessageText(item.content)
}

function deriveUserSource(item: Record<string, any>, joined: string, hasImage: boolean, hasAudio: boolean) {
  if (hasAudio) return 'speech' as const
  if (hasImage && joined) return 'text_with_image' as const
  if (hasImage) return 'image_only' as const
  return 'text' as const
}

function parseCanvasColor(value: unknown) {
  return typeof value === 'string' && (CANVAS_COLORS as readonly string[]).includes(value)
    ? (value as TutorCanvasColor)
    : undefined
}

function parseCanvasDash(value: unknown) {
  return typeof value === 'string' && (CANVAS_DASHES as readonly string[]).includes(value)
    ? (value as TutorCanvasDash)
    : undefined
}

function parseCanvasSize(value: unknown) {
  return typeof value === 'string' && (CANVAS_SIZES as readonly string[]).includes(value)
    ? (value as TutorCanvasSize)
    : undefined
}

function parseCanvasFill(value: unknown) {
  return typeof value === 'string' && (CANVAS_FILLS as readonly string[]).includes(value)
    ? (value as 'none' | 'semi' | 'solid')
    : undefined
}

function parseCanvasLabelPosition(value: unknown) {
  return typeof value === 'string' &&
    (CANVAS_LABEL_POSITIONS as readonly string[]).includes(value)
    ? (value as TutorCanvasLabelPosition)
    : undefined
}

function buildCanvasActionFromPayload(actionType: string, payload: Record<string, any>) {
  const actionId = typeof payload.id === 'string' && payload.id.trim() ? payload.id : crypto.randomUUID()
  const artifactFields = {
    artifactId: normalizeCanvasArtifactId(payload.artifactId),
    artifactGroupId: normalizeCanvasArtifactId(payload.artifactGroupId),
  }

  switch (actionType) {
    case 'clear_tool_layer':
      return {
        ...artifactFields,
        id: actionId,
        type: 'clear_tool_layer' as const,
      }
    case 'focus_region':
      if (
        typeof payload.x !== 'number' ||
        typeof payload.y !== 'number' ||
        typeof payload.width !== 'number' ||
        typeof payload.height !== 'number'
      ) {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'focus_region' as const,
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
      }
    case 'place_text_label':
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || typeof payload.text !== 'string') {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'place_text_label' as const,
        x: payload.x,
        y: payload.y,
        text: payload.text,
        width: typeof payload.width === 'number' ? payload.width : undefined,
        color: parseCanvasColor(payload.color),
      }
    case 'place_math_block':
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || typeof payload.latex !== 'string') {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'place_math_block' as const,
        x: payload.x,
        y: payload.y,
        latex: payload.latex,
        width: typeof payload.width === 'number' ? payload.width : undefined,
        height: typeof payload.height === 'number' ? payload.height : undefined,
        displayMode: typeof payload.displayMode === 'boolean' ? payload.displayMode : undefined,
      }
    case 'place_point':
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number') {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'place_point' as const,
        x: payload.x,
        y: payload.y,
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        labelPosition: parseCanvasLabelPosition(payload.labelPosition),
        labelWidth: typeof payload.labelWidth === 'number' ? payload.labelWidth : undefined,
      }
    case 'draw_line_segment':
      if (
        typeof payload.start?.x !== 'number' ||
        typeof payload.start?.y !== 'number' ||
        typeof payload.end?.x !== 'number' ||
        typeof payload.end?.y !== 'number'
      ) {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'draw_line_segment' as const,
        start: { x: payload.start.x, y: payload.start.y },
        end: { x: payload.end.x, y: payload.end.y },
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
      }
    case 'draw_axes':
      if (
        typeof payload.origin?.x !== 'number' ||
        typeof payload.origin?.y !== 'number' ||
        typeof payload.xLength !== 'number' ||
        typeof payload.yLength !== 'number'
      ) {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'draw_axes' as const,
        origin: { x: payload.origin.x, y: payload.origin.y },
        xLength: payload.xLength,
        yLength: payload.yLength,
        xLabel: typeof payload.xLabel === 'string' ? payload.xLabel : undefined,
        yLabel: typeof payload.yLabel === 'string' ? payload.yLabel : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
      }
    case 'draw_rectangle':
      if (
        typeof payload.x !== 'number' ||
        typeof payload.y !== 'number' ||
        typeof payload.width !== 'number' ||
        typeof payload.height !== 'number'
      ) {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'draw_rectangle' as const,
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
        fill: parseCanvasFill(payload.fill),
        opacity: typeof payload.opacity === 'number' ? payload.opacity : undefined,
      }
    case 'plot_polyline':
      if (!Array.isArray(payload.points)) return null
      return {
        ...artifactFields,
        id: actionId,
        type: 'plot_polyline' as const,
        points: payload.points
          .filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
          .map((point) => ({ x: point.x, y: point.y })),
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        dash: parseCanvasDash(payload.dash),
        size: parseCanvasSize(payload.size),
      }
    case 'highlight_region':
      if (
        typeof payload.x !== 'number' ||
        typeof payload.y !== 'number' ||
        typeof payload.width !== 'number' ||
        typeof payload.height !== 'number'
      ) {
        return null
      }
      return {
        ...artifactFields,
        id: actionId,
        type: 'highlight_region' as const,
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        label: typeof payload.label === 'string' ? payload.label : undefined,
        color: parseCanvasColor(payload.color),
        opacity: typeof payload.opacity === 'number' ? payload.opacity : undefined,
      }
    default:
      return null
  }
}

function extractCanvasActionsFromToolResult(toolName: string, parsed: any): TutorCanvasAction[] {
  if (!parsed || typeof parsed !== 'object') return []

  if (Array.isArray(parsed.canvasActions)) {
    const actions = parsed.canvasActions
      .map((action: Record<string, any>) => buildCanvasActionFromPayload(action.type, action))
      .filter(Boolean)
      .slice(0, MAX_CANVAS_ACTIONS_PER_TOOL_RESULT) as TutorCanvasAction[]
    return assignCanvasArtifactIds(toolName, actions)
  }

  if (toolName === 'canvas_action' && typeof parsed.actionType === 'string' && parsed.payload && typeof parsed.payload === 'object') {
    const action = buildCanvasActionFromPayload(parsed.actionType, parsed.payload as Record<string, any>)
    return action ? assignCanvasArtifactIds(toolName, [action]) : []
  }

  return []
}

function deriveHistoryState(history: RealtimeItem[]) {
  const chatHistory: TutorChatMessage[] = []
  let currentUserTranscript = ''
  let transcript = ''

  for (const item of history as Array<Record<string, any>>) {
    if (item.type !== 'message') continue
    if (item.role === 'system') continue

    const { joined, hasImage, hasAudio, hasSilentContext } = extractCompletedText(item)
    if (hasSilentContext && !joined) {
      continue
    }

    if (item.role === 'user') {
      if (item.status === 'in_progress') {
        currentUserTranscript = joined
        continue
      }
      if (!joined && !hasImage) continue
      chatHistory.push({
        role: 'user',
        content: joined || '[Sent an image]',
        source: deriveUserSource(item, joined, hasImage, hasAudio),
      })
      continue
    }

    if (item.role === 'assistant') {
      if (item.status === 'in_progress') {
        transcript = joined
        continue
      }
      if (!joined) continue
      chatHistory.push({
        role: 'assistant',
        content: joined,
        source: 'assistant',
      })
    }
  }

  return {
    chatHistory,
    currentUserTranscript,
    transcript,
  }
}

function createSilentMediaStream() {
  const audioContext = new AudioContext()
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  const destination = audioContext.createMediaStreamDestination()

  oscillator.type = 'sine'
  oscillator.frequency.value = 220
  gain.gain.value = 0

  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start()

  return {
    stream: destination.stream,
    cleanup: () => {
      try {
        oscillator.stop()
      } catch {
        // ignore
      }
      oscillator.disconnect()
      gain.disconnect()
      void audioContext.close().catch(() => {})
    },
  }
}

function withConnectionTimeout<T>(promise: Promise<T>, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Connection timed out. Please try again.'))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export function useVoiceAgentTutor({
  onError,
}: UseVoiceAgentTutorOptions = {}): TutorSessionAdapter {
  const [state, setState] = useState<TutorState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [lastPauseReason, setLastPauseReason] = useState<'manual' | 'inactivity' | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [supportsLiveMic, setSupportsLiveMic] = useState(true)
  const [connectionMode, setConnectionMode] = useState<'voice' | 'typed'>('voice')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentUserTranscript, setCurrentUserTranscript] = useState('')
  const [transcript, setTranscript] = useState('')
  const [chatHistory, setChatHistory] = useState<TutorChatMessage[]>([])
  const [toolEvents, setToolEvents] = useState<TutorToolEvent[]>([])
  const [pendingCanvasActions, setPendingCanvasActions] = useState<TutorCanvasAction[]>([])

  const sessionRef = useRef<RealtimeSession | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const usageIntervalRef = useRef<number | null>(null)
  const inactivityTimeoutRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const silentInputCleanupRef = useRef<(() => void) | null>(null)
  const connectedRef = useRef(false)
  const pausedRef = useRef(false)
  const mutedRef = useRef(false)
  const autoPauseRef = useRef<() => void>(() => {})

  const clearUsageInterval = useCallback(() => {
    if (usageIntervalRef.current !== null) {
      window.clearInterval(usageIntervalRef.current)
      usageIntervalRef.current = null
    }
  }, [])

  const clearInactivityTimeout = useCallback(() => {
    if (inactivityTimeoutRef.current !== null) {
      window.clearTimeout(inactivityTimeoutRef.current)
      inactivityTimeoutRef.current = null
    }
  }, [])

  const touchServerSessionActivity = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return

    try {
      await fetch('/api/tutor/session/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      // Best-effort only.
    }
  }, [])

  const registerLocalActivity = useCallback(
    (shouldPingServer = false) => {
      if (!connectedRef.current || pausedRef.current) return

      clearInactivityTimeout()
      inactivityTimeoutRef.current = window.setTimeout(() => {
        autoPauseRef.current()
      }, TUTOR_INACTIVITY_PAUSE_SECONDS * 1000)

      if (shouldPingServer) {
        void touchServerSessionActivity()
      }
    },
    [clearInactivityTimeout, touchServerSessionActivity]
  )

  const finalizeTutorSession = useCallback(
    (endedReason: 'user' | 'error' | 'quota') => {
      clearUsageInterval()
      clearInactivityTimeout()
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      if (!sessionId) return

      void fetch('/api/tutor/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, endedReason }),
      }).catch(() => {})
    },
    [clearInactivityTimeout, clearUsageInterval]
  )

  const disconnect = useCallback(
    (endedReason: 'user' | 'error' | 'quota' = 'user') => {
      finalizeTutorSession(endedReason)
      sessionRef.current?.close()
      sessionRef.current = null

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
      if (silentInputCleanupRef.current) {
        silentInputCleanupRef.current()
        silentInputCleanupRef.current = null
      }

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current.srcObject = null
      }

      connectedRef.current = false
      pausedRef.current = false
      mutedRef.current = false

      setCurrentSessionId(null)
      setIsConnected(false)
      setIsPaused(false)
      setLastPauseReason(null)
      setIsMuted(false)
      setIsSpeakerMuted(false)
      setSupportsLiveMic(true)
      setConnectionMode('voice')
      setCurrentUserTranscript('')
      setTranscript('')
      setPendingCanvasActions([])
      setState('idle')
    },
    [finalizeTutorSession]
  )

  const appendToolEvent = useCallback((event: Omit<TutorToolEvent, 'id' | 'createdAt'>) => {
    setToolEvents((prev) =>
      [
        ...prev,
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          ...event,
        },
      ].slice(-MAX_TOOL_EVENTS)
    )
  }, [])

  const pause = useCallback(
    async (reason: 'manual' | 'inactivity' = 'manual', skipServerSync = false) => {
      clearInactivityTimeout()
      pausedRef.current = true
      setIsPaused(true)
      setLastPauseReason(reason)

      const session = sessionRef.current
      session?.interrupt()
      session?.mute(true)

      if (!skipServerSync) {
        const sessionId = sessionIdRef.current
        if (!sessionId) return

        try {
          await fetch('/api/tutor/session/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          })
        } catch {
          // Local pause still protects the session UX.
        }
      }
    },
    [clearInactivityTimeout]
  )

  const resume = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return

    try {
      const res = await fetch('/api/tutor/session/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      const code = (data as { code?: string }).code

      if (!res.ok) {
        if (res.status === 403 && code === 'QUOTA_EXCEEDED') {
          onError?.('Your tutoring time limit has been reached.', code)
          disconnect('quota')
          return
        }
        if (res.status === 403 && code === 'SESSION_LIMIT_REACHED') {
          onError?.('This tutoring session reached its 1 hour limit.', code)
          disconnect('quota')
          return
        }
        if (res.status === 429 && code === 'RATE_LIMITED') {
          onError?.('Too many tutor requests. Please wait a moment and try again.', code)
          return
        }
        onError?.('Could not resume the session. Please try again.', code)
        return
      }

      pausedRef.current = false
      setIsPaused(false)
      setLastPauseReason(null)
      sessionRef.current?.mute(mutedRef.current)
      registerLocalActivity(false)
      setState('listening')
    } catch {
      onError?.('Could not resume the session. Please try again.')
    }
  }, [disconnect, onError, registerLocalActivity])

  autoPauseRef.current = () => {
    void pause('inactivity')
  }

  const connect = useCallback(
    async (options?: TutorConnectOptions) => {
      let startedSessionId: string | null = null

      try {
        setChatHistory([])
        setToolEvents([])
        setPendingCanvasActions([])
        setState('thinking')

        const audioMode = options?.audioMode === 'silent' ? 'silent' : 'microphone'
        const mediaStream =
          audioMode === 'silent'
            ? (() => {
                const silentInput = createSilentMediaStream()
                silentInputCleanupRef.current = silentInput.cleanup
                setSupportsLiveMic(false)
                setConnectionMode('typed')
                setIsMuted(true)
                mutedRef.current = true
                return silentInput.stream
              })()
            : await navigator.mediaDevices.getUserMedia({ audio: true })

        if (audioMode === 'microphone') {
          setSupportsLiveMic(true)
          setConnectionMode('voice')
          setIsMuted(false)
          mutedRef.current = false
        }

        mediaStreamRef.current = mediaStream

        const startSessionRes = await fetch('/api/tutor/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: options?.language ?? 'en',
            gradeLevel: options?.gradeLevel ?? '',
            modelSnapshot: 'gpt-realtime-1.5 (agent-lab)',
          }),
        })
        const startSessionData = await startSessionRes.json().catch(() => ({}))
        if (!startSessionRes.ok) {
          const code = (startSessionData as { code?: string }).code
          if (startSessionRes.status === 401 || code === 'UNAUTHORIZED') {
            throw new Error('Please sign in again.')
          }
          if (startSessionRes.status === 403 || code === 'QUOTA_EXCEEDED') {
            throw new Error('Your tutoring time limit has been reached.')
          }
          if (code === 'SESSION_LIMIT_REACHED') {
            throw new Error('This tutoring session reached its 1 hour limit.')
          }
          if (startSessionRes.status === 429 || code === 'RATE_LIMITED') {
            throw new Error('Too many session attempts. Please wait a moment and try again.')
          }
          throw new Error('Something went wrong. Please try again.')
        }

        startedSessionId = (startSessionData as { sessionId?: string }).sessionId ?? null
        sessionIdRef.current = startedSessionId
        setCurrentSessionId(startedSessionId)
        if (!startedSessionId) {
          throw new Error('Something went wrong. Please try again.')
        }

        const sessionBootstrapRes = await fetch('/api/voice-agent/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: startedSessionId,
            language: options?.language ?? 'en',
            gradeLevel: options?.gradeLevel ?? '',
          }),
        })

        const sessionBootstrap = await sessionBootstrapRes.json().catch(() => ({}))
        if (!sessionBootstrapRes.ok) {
          const code = (sessionBootstrap as { code?: string }).code
          if (sessionBootstrapRes.status === 401 || code === 'UNAUTHORIZED') {
            throw new Error('Please sign in again.')
          }
          if (sessionBootstrapRes.status === 429 || code === 'QUOTA_EXCEEDED') {
            throw new Error('Your tutoring time limit has been reached.')
          }
          if (code === 'SESSION_LIMIT_REACHED') {
            throw new Error('This tutoring session reached its 1 hour limit.')
          }
          if (code === 'RATE_LIMITED') {
            throw new Error('Too many connection attempts. Please wait a moment and try again.')
          }
          throw new Error('Something went wrong. Please try again.')
        }

        const voiceAgentData = sessionBootstrap as {
          value?: string
          model?: string
          instructions?: string
          voice?: string
          transcriptionModel?: string
          language?: string
        }
        if (!voiceAgentData.value || !voiceAgentData.model || !voiceAgentData.instructions) {
          throw new Error('Something went wrong. Please try again.')
        }

        const audioEl = document.createElement('audio')
        audioEl.autoplay = true
        audioEl.muted = isSpeakerMuted
        audioRef.current = audioEl

        const agent = new RealtimeAgent({
          name: 'lemma-voice-agent-lab',
          voice: voiceAgentData.voice ?? 'marin',
          instructions: voiceAgentData.instructions,
          tools: createVoiceAgentTools(),
        })

        const transport = new OpenAIRealtimeWebRTC({
          audioElement: audioEl,
          mediaStream,
        })

        const session = new RealtimeSession(agent, {
          transport,
          config: {
            outputModalities: ['audio'],
            audio: {
              input: {
                transcription: {
                  model: voiceAgentData.transcriptionModel ?? 'gpt-4o-transcribe',
                  language: voiceAgentData.language ?? options?.language ?? 'en',
                },
              },
              output: {
                voice: voiceAgentData.voice ?? 'marin',
              },
            },
          },
        })
        sessionRef.current = session

        session.on('history_updated', (history) => {
          const nextState = deriveHistoryState(history)
          setChatHistory(nextState.chatHistory)
          setCurrentUserTranscript(nextState.currentUserTranscript)
          setTranscript(nextState.transcript)
        })

        session.on('agent_start', () => {
          if (!pausedRef.current) {
            setState('thinking')
          }
        })

        session.on('agent_end', () => {
          if (!pausedRef.current) {
            setState('listening')
          }
        })

        session.on('audio_start', () => {
          if (!pausedRef.current) {
            setState('speaking')
          }
        })

        session.on('audio_stopped', () => {
          if (!pausedRef.current) {
            setState('listening')
          }
        })

        session.on('agent_tool_start', (_, __, toolDef, details) => {
          const toolCall = details.toolCall as { arguments?: string; callId?: string }
          appendToolEvent({
            type: 'tool_started',
            toolName: toolDef.name,
            input: parseJsonSafely(toolCall.arguments),
            metadata: { callId: toolCall.callId },
          })
        })

        session.on('agent_tool_end', (_, __, toolDef, result, details) => {
          const toolCall = details.toolCall as { arguments?: string; callId?: string }
          const parsedResult = parseJsonSafely(result) ?? result
          const parsedInput = parseJsonSafely(toolCall.arguments)

          appendToolEvent({
            type: 'tool_completed',
            toolName: toolDef.name,
            input: parsedInput,
            output: parsedResult,
            metadata: { callId: toolCall.callId },
          })

          const actions = extractCanvasActionsFromToolResult(toolDef.name, parsedResult)
          if (actions.length > 0) {
            const shouldReplaceQueue = actions.some((action) => action.type === 'clear_tool_layer')
            setPendingCanvasActions((prev) => {
              const nextActions = shouldReplaceQueue ? actions : [...prev, ...actions]
              return nextActions.slice(-MAX_PENDING_CANVAS_ACTIONS)
            })
            appendToolEvent({
              type: 'canvas_action',
              toolName: toolDef.name,
              input: parsedInput,
              output: actions,
            })
          }
        })

        session.on('transport_event', (event) => {
          if (event.type === 'input_audio_buffer.speech_started') {
            registerLocalActivity(true)
            setState('listening')
          }
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            registerLocalActivity(true)
          }
        })

        session.on('error', ({ error }) => {
          const rawMsg =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
              ? error
              : JSON.stringify(error)
          console.error('[Lemma Voice Agent Lab] Session error:', rawMsg)
          logErrorToServer('voice-agent-session', rawMsg)
          appendToolEvent({
            type: 'tool_failed',
            toolName: 'session',
            output: rawMsg,
          })
          onError?.('Something went wrong. Please try again.', rawMsg)
          setState('idle')
        })

        await withConnectionTimeout(
          session.connect({
            apiKey: voiceAgentData.value,
            model: voiceAgentData.model,
          })
        )

        if (audioMode === 'silent') {
          session.mute(true)
        }

        connectedRef.current = true
        pausedRef.current = false
        setIsConnected(true)
        setIsPaused(false)
        setLastPauseReason(null)
        setState('listening')
        registerLocalActivity(false)

        clearUsageInterval()
        usageIntervalRef.current = window.setInterval(async () => {
          const sessionId = sessionIdRef.current
          if (!sessionId) return

          try {
            const res = await fetch('/api/tutor/usage/tick', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })

            const data = await res.json().catch(() => ({}))
            const code = (data as { code?: string }).code
            if (res.status === 403 && code === 'QUOTA_EXCEEDED') {
              onError?.('Your tutoring time limit has been reached.', code)
              disconnect('quota')
              return
            }
            if (res.status === 403 && code === 'SESSION_LIMIT_REACHED') {
              onError?.('This tutoring session reached its 1 hour limit.', code)
              disconnect('quota')
              return
            }
            if (res.status === 429 && code === 'RATE_LIMITED') {
              onError?.('Too many tutor requests. Please wait a moment and try again.', code)
              return
            }

            const tickData = data as { paused?: boolean; inactivityPaused?: boolean }
            if (tickData.paused && tickData.inactivityPaused && !pausedRef.current) {
              void pause('inactivity', true)
            }
          } catch {
            // Best-effort only.
          }
        }, 25000)
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err)
        const isMicPermissionError =
          err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
        const isMicMissingError = err instanceof DOMException && err.name === 'NotFoundError'
        const userMsg =
          isMicPermissionError
            ? 'Allow microphone access to start tutoring, or use the typed lab start instead.'
            : isMicMissingError
            ? 'No microphone was found. Connect one and try again.'
            : rawMsg === 'Please sign in again.' || rawMsg === 'Your tutoring time limit has been reached.'
            ? rawMsg
            : rawMsg.includes('try again')
            ? rawMsg
            : 'Something went wrong. Please try again.'

        console.error('[Lemma Voice Agent Lab] Connection error:', rawMsg)
        logErrorToServer('voice-agent-connection', rawMsg)
        onError?.(userMsg, rawMsg)
        setState('idle')

        if (startedSessionId) {
          disconnect(rawMsg === 'Your tutoring time limit has been reached.' ? 'quota' : 'error')
        } else {
          disconnect('error')
        }

        throw new Error(userMsg)
      }
    },
    [
      appendToolEvent,
      clearUsageInterval,
      disconnect,
      isSpeakerMuted,
      onError,
      pause,
      registerLocalActivity,
    ]
  )

  const sendText = useCallback(
    (text: string, options?: TutorSendTextOptions) => {
      if (pausedRef.current || !sessionRef.current) return
      registerLocalActivity(false)
      const boardContext = buildSilentTutorBoardContext(options?.boardDescription)
      if (boardContext) {
        sessionRef.current.updateHistory((history) =>
          history
            .map((item) => stripSilentTutorBoardContextParts(item as RealtimeItem & { content?: unknown }))
            .filter((item): item is RealtimeItem => Boolean(item))
        )
        sessionRef.current.sendMessage({
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: boardContext },
            { type: 'input_text', text },
          ],
        })
      } else {
        sessionRef.current.sendMessage(text)
      }
      setState('thinking')
    },
    [registerLocalActivity]
  )

  const sendImage = useCallback(
    (base64Data: string, mimeType: string) => {
      if (pausedRef.current || !sessionRef.current) return
      registerLocalActivity(false)
      sessionRef.current.addImage(`data:${mimeType};base64,${base64Data}`)
      setState('thinking')
    },
    [registerLocalActivity]
  )

  const sendTextWithImage = useCallback(
    (text: string, base64Data: string, mimeType: string) => {
      if (pausedRef.current || !sessionRef.current) return
      registerLocalActivity(false)
      sessionRef.current.sendMessage({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text },
          { type: 'input_image', image: `data:${mimeType};base64,${base64Data}` },
        ],
      })
      setState('thinking')
    },
    [registerLocalActivity]
  )

  const sendCanvasImage = useCallback(
    (base64: string, mimeType: string = 'image/jpeg') => {
      if (pausedRef.current || !sessionRef.current) return
      registerLocalActivity(false)
      sessionRef.current.updateHistory((history) =>
        history
          .map((item) =>
            stripSilentTutorBoardContextParts(item as RealtimeItem & { content?: unknown }, {
              preserveVisibleMessages: true,
            })
          )
          .filter((item): item is RealtimeItem => Boolean(item))
      )

      const transport = sessionRef.current.transport as {
        sendMessage?: (
          message: {
            type: 'message'
            role: 'user'
            content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image: string }>
          },
          otherEventData?: Record<string, unknown>,
          options?: { triggerResponse?: boolean }
        ) => void
      }

      transport.sendMessage?.(
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `${TUTOR_SILENT_BOARD_CONTEXT_MARKER}: Latest board context. Use this image only as silent tutoring context unless the student explicitly asks about the board.`,
            },
            {
              type: 'input_image',
              image: `data:${mimeType};base64,${base64}`,
            },
          ],
        },
        {},
        { triggerResponse: false }
      )
    },
    [registerLocalActivity]
  )

  const mute = useCallback(() => {
    if (!supportsLiveMic) {
      setIsMuted(true)
      return
    }
    mutedRef.current = true
    setIsMuted(true)
    sessionRef.current?.mute(true)
  }, [supportsLiveMic])

  const unmute = useCallback(() => {
    if (!supportsLiveMic) {
      onError?.('This lab session started without microphone input. Restart with mic to speak out loud.')
      return
    }
    mutedRef.current = false
    setIsMuted(false)
    if (!pausedRef.current) {
      sessionRef.current?.mute(false)
    }
  }, [onError, supportsLiveMic])

  const muteSpeaker = useCallback(() => {
    setIsSpeakerMuted(true)
    if (audioRef.current) {
      audioRef.current.muted = true
    }
  }, [])

  const unmuteSpeaker = useCallback(() => {
    setIsSpeakerMuted(false)
    if (audioRef.current) {
      audioRef.current.muted = false
    }
  }, [])

  const acknowledgeCanvasAction = useCallback((actionId: string) => {
    setPendingCanvasActions((prev) => prev.filter((action) => action.id !== actionId))
  }, [])

  useEffect(() => {
    return () => {
      disconnect('user')
    }
  }, [disconnect])

  return {
    state,
    isConnected,
    isPaused,
    lastPauseReason,
    isMuted,
    isSpeakerMuted,
    supportsLiveMic,
    connectionMode,
    currentSessionId,
    currentUserTranscript,
    transcript,
    chatHistory,
    toolEvents,
    pendingCanvasActions,
    connect,
    disconnect,
    sendText,
    sendImage,
    sendTextWithImage,
    sendCanvasImage,
    mute,
    unmute,
    pause,
    resume,
    muteSpeaker,
    unmuteSpeaker,
    acknowledgeCanvasAction,
  }
}
