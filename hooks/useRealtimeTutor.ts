/**
 * useRealtimeTutor Hook
 *
 * Manages the full lifecycle of a Realtime API session: WebRTC connection,
 * audio streaming, data channel events, and sending text/image inputs.
 *
 * Flow:
 * 1. connect() → fetch ephemeral token → POST SDP to OpenAI → WebRTC established
 * 2. Audio: microphone → WebRTC track → OpenAI; OpenAI audio → WebRTC → autoplay
 * 3. Events: data channel receives JSON events (session, response, transcript)
 * 4. Text/Image: send via data channel conversation.item.create + response.create
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TutorState } from '@/components/TutorAvatar'
import { TUTOR_INACTIVITY_PAUSE_SECONDS } from '@/lib/tutor/constants'
import type {
  TutorChatMessage,
  TutorCanvasAction,
  TutorConnectOptions,
  TutorSessionAdapter,
  TutorToolEvent,
  TutorUserMessageSource,
} from '@/lib/tutor/session-adapter'

type UseRealtimeTutorOptions = {
  /** Called with user-friendly message (raw error logged to console) */
  onError?: (userMessage: string, rawError?: string) => void
  /** Called when user speech starts (for on-speech canvas send) */
  onSpeechStarted?: () => void
  /** After a user turn is appended to chat (for minimal server logging). */
  onUserMessageLogged?: (payload: { content: string; source: TutorUserMessageSource }) => void
  /** Assistant turn finalized (response.done / response.cancelled). */
  onAssistantFinalized?: (content: string) => void
}

/**
 * Hook for managing the OpenAI Realtime API WebRTC session.
 *
 * @param options.onError - Called when connection fails or API returns an error
 * @returns { state, isConnected, transcript, connect, disconnect, sendText, sendImage, sendTextWithImage }
 */
const LEMMA_CANVAS_ITEM_ID = 'lemma_canvas_context'

function logErrorToServer(source: string, rawError?: string) {
  void fetch('/api/realtime/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, rawError: rawError ?? source }),
  }).catch(() => {})
}

export function useRealtimeTutor({
  onError,
  onSpeechStarted,
  onUserMessageLogged,
  onAssistantFinalized,
}: UseRealtimeTutorOptions = {}): TutorSessionAdapter {
  const onUserMessageLoggedRef = useRef(onUserMessageLogged)
  const onAssistantFinalizedRef = useRef(onAssistantFinalized)
  onUserMessageLoggedRef.current = onUserMessageLogged
  onAssistantFinalizedRef.current = onAssistantFinalized
  const [state, setState] = useState<TutorState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [lastPauseReason, setLastPauseReason] = useState<'manual' | 'inactivity' | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentUserTranscript, setCurrentUserTranscript] = useState<string>('')
  const [transcript, setTranscript] = useState<string>('')
  const [chatHistory, setChatHistory] = useState<TutorChatMessage[]>([])
  const [toolEvents] = useState<TutorToolEvent[]>([])
  const [pendingCanvasActions] = useState<TutorCanvasAction[]>([])
  const transcriptRef = useRef<string>('')
  const currentUserTranscriptRef = useRef<string>('')
  const pendingInputAudioItemIdRef = useRef<string | null>(null)
  const pendingInputAudioTranscriptsRef = useRef<Map<string, string>>(new Map())
  const isResponseActiveRef = useRef(false)
  const inactivityTimeoutRef = useRef<number | null>(null)
  const autoPauseRef = useRef<() => void>(() => {})
  const sessionIdRef = useRef<string | null>(null)
  const usageIntervalRef = useRef<number | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioTrackRef = useRef<MediaStreamTrack | null>(null)
  const canvasItemIdRef = useRef<string | null>(null)

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
      if (!isConnected || isPaused) return

      clearInactivityTimeout()
      inactivityTimeoutRef.current = window.setTimeout(() => {
        autoPauseRef.current()
      }, TUTOR_INACTIVITY_PAUSE_SECONDS * 1000)

      if (shouldPingServer) {
        void touchServerSessionActivity()
      }
    },
    [clearInactivityTimeout, isConnected, isPaused, touchServerSessionActivity]
  )

  const finalizeTutorSession = useCallback((endedReason: 'user' | 'error' | 'quota') => {
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
  }, [clearInactivityTimeout, clearUsageInterval])

  /**
   * Closes the WebRTC connection and resets all state.
   * Called on disconnect button click or when the data channel closes.
   */
  const disconnect = useCallback((endedReason: 'user' | 'error' | 'quota' = 'user') => {
    finalizeTutorSession(endedReason)
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop()
      audioTrackRef.current = null
    }
    canvasItemIdRef.current = null
    isResponseActiveRef.current = false
    setCurrentSessionId(null)
    setIsConnected(false)
    setIsPaused(false)
    setLastPauseReason(null)
    setIsMuted(false)
    setIsSpeakerMuted(false)
    setCurrentUserTranscript('')
    setTranscript('')
    transcriptRef.current = ''
    currentUserTranscriptRef.current = ''
    pendingInputAudioItemIdRef.current = null
    pendingInputAudioTranscriptsRef.current.clear()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.muted = false
    }
    setState('idle')
  }, [finalizeTutorSession])

  /**
   * Establishes the WebRTC connection to OpenAI's Realtime API.
   *
   * Steps:
   * 1. Create RTCPeerConnection with microphone track
   * 2. Create data channel "oai-events" for JSON events
   * 3. Fetch ephemeral token from our /api/realtime/token
   * 4. POST SDP offer directly to OpenAI (avoids server timeout)
   * 5. Set remote description with OpenAI's SDP answer
   */
  const connect = useCallback(async (options?: TutorConnectOptions) => {
    let startedSessionId: string | null = null
    try {
      setChatHistory([])
      setState('thinking')

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
      const track = ms.getTracks()[0]
      audioTrackRef.current = track

      const startSessionRes = await fetch('/api/tutor/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: options?.language ?? 'en',
          gradeLevel: options?.gradeLevel ?? '',
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

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Hidden audio element for playing tutor's voice. Autoplay required for WebRTC.
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.muted = isSpeakerMuted
      audioRef.current = audioEl

      // When OpenAI sends audio, attach it to our audio element
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          audioEl.srcObject = e.streams[0]
        }
      }

      // Add microphone as input track
      pc.addTrack(track)

      // Data channel for JSON events (text input, image upload, server events)
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.addEventListener('message', (e) => {
        try {
          const event = JSON.parse(e.data)
          handleServerEvent(event)
        } catch {
          // ignore parse errors
        }
      })

      dc.addEventListener('open', () => {
        setIsConnected(true)
        setState('listening')
        setLastPauseReason(null)
        if (audioTrackRef.current) audioTrackRef.current.enabled = true
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
            if (tickData.paused && tickData.inactivityPaused && !isPaused) {
              autoPauseRef.current()
            }
          } catch {
            // Non-fatal: usage reporting can retry on the next interval.
          }
        }, 25000)
      })

      dc.addEventListener('close', () => {
        disconnect('error')
      })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 1. Get ephemeral token from our server (fast, ~1s)
      const tokenRes = await fetch('/api/realtime/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: options?.language ?? 'en',
          gradeLevel: options?.gradeLevel ?? '',
        }),
      })
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}))
        const errObj = err as {
          error?: string
          details?: string
          code?: string
          message?: string
        }
        const rawErr = errObj.error || errObj.details || errObj.message || JSON.stringify(err)
        console.error('[Lemma Tutor] Token request failed:', rawErr)
        logErrorToServer('token', rawErr)
        if (tokenRes.status === 401 || errObj.code === 'UNAUTHORIZED') {
          throw new Error('Please sign in again.')
        }
        if (tokenRes.status === 429 || errObj.code === 'QUOTA_EXCEEDED') {
          throw new Error('Your tutoring time limit has been reached.')
        }
        if (errObj.code === 'SESSION_LIMIT_REACHED') {
          throw new Error('This tutoring session reached its 1 hour limit.')
        }
        if (errObj.code === 'RATE_LIMITED') {
          throw new Error('Too many connection attempts. Please wait a moment and try again.')
        }
        throw new Error('Something went wrong. Please try again.')
      }
      const { value: ephemeralKey } = (await tokenRes.json()) as {
        value?: string
      }
      if (!ephemeralKey) {
        console.error('[Lemma Tutor] No token in response')
        logErrorToServer('token', 'No token in response')
        throw new Error('Something went wrong. Please try again.')
      }

      // 2. Client connects directly to OpenAI for WebRTC (avoids server timeout)
      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        }
      )

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text()
        console.error('[Lemma Tutor] WebRTC/session error:', errText)
        logErrorToServer('webrtc', errText)
        let errMsg = 'Something went wrong. Please try again.'
        try {
          const parsed = JSON.parse(errText)
          if (parsed.error?.message?.includes('504') || parsed.error?.message?.includes('timeout') || errText.includes('504') || errText.includes('timeout')) {
            errMsg = 'OpenAI is taking too long. Please try again.'
          }
        } catch {
          if (errText.includes('504') || errText.includes('timeout')) {
            errMsg = 'OpenAI is taking too long. Please try again.'
          }
        }
        throw new Error(errMsg)
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      const isMicPermissionError =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      const isMicMissingError = err instanceof DOMException && err.name === 'NotFoundError'
      const userMsg =
        isMicPermissionError
          ? 'Allow microphone access to start tutoring.'
          : isMicMissingError
            ? 'No microphone was found. Connect one and try again.'
            : rawMsg === 'Please sign in again.' || rawMsg === 'Your tutoring time limit has been reached.'
          ? rawMsg
          : rawMsg.includes('try again')
            ? rawMsg
            : 'Something went wrong. Please try again.'
      console.error('[Lemma Tutor] Connection error:', rawMsg)
      logErrorToServer('connection', rawMsg)
      onError?.(userMsg, rawMsg)
      setState('idle')
      if (startedSessionId) {
        disconnect(rawMsg === 'Your tutoring time limit has been reached.' ? 'quota' : 'error')
      } else {
        disconnect('error')
      }
      throw new Error(userMsg)
    }
  }, [clearUsageInterval, disconnect, isPaused, onError, registerLocalActivity, isSpeakerMuted])

  /**
   * Handles server-sent events from the Realtime API data channel.
   * Updates UI state (listening/thinking/speaking) and transcript.
   */
  const handleServerEvent = useCallback(
    (event: { type: string; [key: string]: unknown }) => {
      switch (event.type) {
        case 'session.created':
        case 'session.updated':
          setState('listening')
          break
        case 'conversation.item.added': {
          const item = (event as { item?: { id?: string; content?: Array<{ type?: string }> } })
            .item
          if (item?.id === LEMMA_CANVAS_ITEM_ID && item?.content?.some((c) => c.type === 'input_image')) {
            canvasItemIdRef.current = item.id ?? null
          }
          break
        }
        case 'input_audio_buffer.committed': {
          const itemId = (event as { item_id?: string }).item_id ?? null
          if (itemId) {
            pendingInputAudioItemIdRef.current = itemId
            pendingInputAudioTranscriptsRef.current.set(itemId, '')
            currentUserTranscriptRef.current = ''
            setCurrentUserTranscript('')
          }
          break
        }
        case 'input_audio_buffer.speech_started':
          registerLocalActivity(true)
          onSpeechStarted?.()
          setState('listening')
          break
        case 'conversation.item.input_audio_transcription.delta': {
          const itemId = (event as { item_id?: string }).item_id ?? null
          const delta = (event as { delta?: string }).delta ?? ''
          if (!itemId || !delta) break
          const nextTranscript =
            (pendingInputAudioTranscriptsRef.current.get(itemId) ?? '') + delta
          pendingInputAudioTranscriptsRef.current.set(itemId, nextTranscript)

          if (
            !pendingInputAudioItemIdRef.current ||
            pendingInputAudioItemIdRef.current === itemId
          ) {
            pendingInputAudioItemIdRef.current = itemId
            currentUserTranscriptRef.current = nextTranscript
            setCurrentUserTranscript(nextTranscript)
          }
          break
        }
        case 'conversation.item.input_audio_transcription.completed': {
          const itemId = (event as { item_id?: string }).item_id ?? null
          const completedTranscript = (event as { transcript?: string }).transcript?.trim() ?? ''
          if (!itemId) break

          pendingInputAudioTranscriptsRef.current.delete(itemId)
          if (pendingInputAudioItemIdRef.current === itemId) {
            pendingInputAudioItemIdRef.current = null
            currentUserTranscriptRef.current = ''
            setCurrentUserTranscript('')
          }

          if (completedTranscript) {
            setChatHistory((prev) => [
              ...prev,
              { role: 'user', content: completedTranscript, source: 'speech' },
            ])
            onUserMessageLoggedRef.current?.({ content: completedTranscript, source: 'speech' })
          }
          break
        }
        case 'conversation.item.input_audio_transcription.failed': {
          const itemId = (event as { item_id?: string }).item_id ?? null
          if (!itemId) break
          pendingInputAudioTranscriptsRef.current.delete(itemId)
          if (pendingInputAudioItemIdRef.current === itemId) {
            pendingInputAudioItemIdRef.current = null
            currentUserTranscriptRef.current = ''
            setCurrentUserTranscript('')
          }
          break
        }
        case 'response.created':
          isResponseActiveRef.current = true
          setState('thinking')
          setTranscript('')
          transcriptRef.current = ''
          break
        case 'response.output_audio_transcript.delta': {
          const delta = (event as { delta?: string }).delta ?? ''
          setTranscript((prev) => prev + delta)
          transcriptRef.current += delta
          break
        }
        case 'response.output_audio.delta':
          setState('speaking')
          break
        case 'response.output_audio.done':
          setState('listening')
          break
        case 'response.done': {
          const content = transcriptRef.current.trim()
          if (content) {
            setChatHistory((prev) => [...prev, { role: 'assistant', content, source: 'assistant' }])
            onAssistantFinalizedRef.current?.(content)
          }
          isResponseActiveRef.current = false
          setTranscript('')
          transcriptRef.current = ''
          setState('listening')
          break
        }
        case 'response.cancelled': {
          const content = transcriptRef.current.trim()
          if (content) {
            setChatHistory((prev) => [...prev, { role: 'assistant', content, source: 'assistant' }])
            onAssistantFinalizedRef.current?.(content)
          }
          isResponseActiveRef.current = false
          setTranscript('')
          transcriptRef.current = ''
          setState('listening')
          break
        }
        case 'error': {
          const rawMsg = (event as { error?: { message?: string } }).error?.message ?? 'Unknown error'
          if (rawMsg.includes('Cancellation failed: no active response found')) {
            isResponseActiveRef.current = false
            break
          }
          isResponseActiveRef.current = false
          console.error('[Lemma Tutor] Session error:', rawMsg)
          logErrorToServer('session', rawMsg)
          onError?.('Something went wrong. Please try again.', rawMsg)
          setState('idle')
          break
        }
      }
    },
    [onError, onSpeechStarted, registerLocalActivity]
  )

  /**
   * Sends a text message to the tutor and triggers a response.
   * Uses conversation.item.create (input_text) + response.create.
   */
  const sendText = useCallback((text: string) => {
    if (isPaused) return
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

    registerLocalActivity(false)
    setChatHistory((prev) => [...prev, { role: 'user', content: text, source: 'text' }])
    onUserMessageLoggedRef.current?.({ content: text, source: 'text' })
    dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      })
    )
    dc.send(JSON.stringify({ type: 'response.create' }))
    setState('thinking')
  }, [isPaused, registerLocalActivity])

  /**
   * Sends an image to the tutor and triggers a response.
   * Realtime API expects data:image/{format};base64,{data} for input_image.
   */
  const sendImage = useCallback((base64Data: string, mimeType: string) => {
    if (isPaused) return
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

    registerLocalActivity(false)
    setChatHistory((prev) => [...prev, { role: 'user', content: '[Sent an image]', source: 'image_only' }])
    onUserMessageLoggedRef.current?.({ content: '[Sent an image]', source: 'image_only' })
    const format = mimeType.replace('image/', '')
    dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: `data:image/${format};base64,${base64Data}`,
            },
          ],
        },
      })
    )
    dc.send(JSON.stringify({ type: 'response.create' }))
    setState('thinking')
  }, [isPaused, registerLocalActivity])

  /**
   * Sends text and image together (e.g. "Help me with step 2" + problem image).
   * Both content parts go in a single conversation.item.create message.
   */
  const sendTextWithImage = useCallback(
    (text: string, base64Data: string, mimeType: string) => {
      if (isPaused) return
      const dc = dcRef.current
      if (!dc || dc.readyState !== 'open') return

      registerLocalActivity(false)
      setChatHistory((prev) => [...prev, { role: 'user', content: text, source: 'text_with_image' }])
      onUserMessageLoggedRef.current?.({ content: text, source: 'text_with_image' })
      const format = mimeType.replace('image/', '')
      dc.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text },
              {
                type: 'input_image',
                image_url: `data:image/${format};base64,${base64Data}`,
              },
            ],
          },
        })
      )
      dc.send(JSON.stringify({ type: 'response.create' }))
      setState('thinking')
    },
    [isPaused, registerLocalActivity]
  )

  /**
   * Sends canvas image as context only (no response.create).
   * Uses replace strategy: deletes previous canvas item before adding new one.
   */
  const sendCanvasImage = useCallback((base64: string, mimeType: string = 'image/jpeg') => {
    if (isPaused) return
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

    registerLocalActivity(false)
    if (canvasItemIdRef.current) {
      dc.send(
        JSON.stringify({
          type: 'conversation.item.delete',
          item_id: canvasItemIdRef.current,
        })
      )
      canvasItemIdRef.current = null
    }

    const format = mimeType.replace('image/', '')
    dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          id: LEMMA_CANVAS_ITEM_ID,
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: `data:image/${format};base64,${base64}`,
            },
          ],
        },
      })
    )
  }, [isPaused, registerLocalActivity])

  const mute = useCallback(() => {
    setIsMuted(true)
    if (audioTrackRef.current) audioTrackRef.current.enabled = false
  }, [])

  const unmute = useCallback(() => {
    setIsMuted(false)
    if (audioTrackRef.current && !isPaused) {
      audioTrackRef.current.enabled = true
    }
  }, [isPaused])

  const applyLocalPause = useCallback((reason: 'manual' | 'inactivity') => {
    clearInactivityTimeout()
    setIsPaused(true)
    setLastPauseReason(reason)
    if (audioTrackRef.current) audioTrackRef.current.enabled = false
    const dc = dcRef.current
    if (dc && dc.readyState === 'open' && isResponseActiveRef.current) {
      dc.send(JSON.stringify({ type: 'response.cancel' }))
    }
  }, [clearInactivityTimeout])

  const pause = useCallback(
    async (reason: 'manual' | 'inactivity' = 'manual', skipServerSync = false) => {
      applyLocalPause(reason)
      const sessionId = sessionIdRef.current
      if (!sessionId || skipServerSync) return

      try {
        await fetch('/api/tutor/session/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
      } catch {
        // Best-effort only. Local pause still protects the session UX.
      }
    },
    [applyLocalPause]
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
        if (code === 'QUOTA_EXCEEDED') {
          onError?.('Your tutoring time limit has been reached.', code)
          disconnect('quota')
          return
        }
        if (code === 'SESSION_LIMIT_REACHED') {
          onError?.('This tutoring session reached its 1 hour limit.', code)
          disconnect('quota')
          return
        }
        onError?.('Something went wrong. Please try again.', code)
        return
      }

      setIsPaused(false)
      setLastPauseReason(null)
      if (audioTrackRef.current && !isMuted) {
        audioTrackRef.current.enabled = true
      }
      registerLocalActivity(true)
    } catch {
      onError?.('Something went wrong. Please try again.')
    }
  }, [disconnect, isMuted, onError, registerLocalActivity])

  autoPauseRef.current = () => {
    void pause('inactivity')
  }

  const muteSpeaker = useCallback(() => {
    setIsSpeakerMuted(true)
    if (audioRef.current) audioRef.current.muted = true
  }, [])

  const unmuteSpeaker = useCallback(() => {
    setIsSpeakerMuted(false)
    if (audioRef.current) audioRef.current.muted = false
  }, [])

  useEffect(() => {
    if (!isConnected || isPaused) {
      clearInactivityTimeout()
      return
    }

    const handleActivity = () => {
      registerLocalActivity(false)
    }

    registerLocalActivity(false)
    window.addEventListener('pointerdown', handleActivity)
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)

    return () => {
      window.removeEventListener('pointerdown', handleActivity)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      clearInactivityTimeout()
    }
  }, [clearInactivityTimeout, isConnected, isPaused, registerLocalActivity])

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect('user')
  }, [disconnect])

  return {
    state,
    isConnected,
    isPaused,
    lastPauseReason,
    isMuted,
    isSpeakerMuted,
    supportsLiveMic: true,
    connectionMode: 'voice',
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
    currentSessionId,
    mute,
    unmute,
    pause,
    resume,
    muteSpeaker,
    unmuteSpeaker,
    acknowledgeCanvasAction: () => {},
  }
}
