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

type UseRealtimeTutorOptions = {
  onError?: (error: string) => void
  /** Called when user speech starts (for on-speech canvas send) */
  onSpeechStarted?: () => void
}

/**
 * Hook for managing the OpenAI Realtime API WebRTC session.
 *
 * @param options.onError - Called when connection fails or API returns an error
 * @returns { state, isConnected, transcript, connect, disconnect, sendText, sendImage, sendTextWithImage }
 */
const LEMMA_CANVAS_ITEM_ID = 'lemma_canvas_context'

export function useRealtimeTutor({ onError, onSpeechStarted }: UseRealtimeTutorOptions = {}) {
  const [state, setState] = useState<TutorState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [transcript, setTranscript] = useState<string>('')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioTrackRef = useRef<MediaStreamTrack | null>(null)
  const canvasItemIdRef = useRef<string | null>(null)

  /**
   * Closes the WebRTC connection and resets all state.
   * Called on disconnect button click or when the data channel closes.
   */
  const disconnect = useCallback(() => {
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
    audioTrackRef.current = null
    canvasItemIdRef.current = null
    setIsConnected(false)
    setIsPaused(false)
    setState('idle')
  }, [])

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
  const connect = useCallback(async () => {
    try {
      setState('thinking')

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Hidden audio element for playing tutor's voice. Autoplay required for WebRTC.
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioRef.current = audioEl

      // When OpenAI sends audio, attach it to our audio element
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          audioEl.srcObject = e.streams[0]
        }
      }

      // Add microphone as input track
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
      pc.addTrack(ms.getTracks()[0])

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
      })

      dc.addEventListener('close', () => {
        disconnect()
      })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 1. Get ephemeral token from our server (fast, ~1s)
      const tokenRes = await fetch('/api/realtime/token', { method: 'POST' })
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to get token')
      }
      const { value: ephemeralKey } = (await tokenRes.json()) as {
        value?: string
      }
      if (!ephemeralKey) throw new Error('No token received')

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
        let errMsg = 'Failed to create session'
        try {
          const parsed = JSON.parse(errText)
          errMsg = parsed.error?.message || parsed.error || errMsg
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
      const message = err instanceof Error ? err.message : 'Connection failed'
      onError?.(message)
      setState('idle')
      disconnect()
    }
  }, [disconnect, onError])

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
          if (item?.content?.some((c) => c.type === 'input_image')) {
            canvasItemIdRef.current = item.id ?? null
          }
          break
        }
        case 'input_audio_buffer.speech_started':
          setState('listening')
          break
        case 'response.created':
          setState('thinking')
          setTranscript('')
          break
        case 'response.output_audio_transcript.delta':
          setTranscript((prev) => prev + ((event as { delta?: string }).delta ?? ''))
          break
        case 'response.output_audio.delta':
          setState('speaking')
          break
        case 'response.done':
        case 'response.output_audio.done':
          setState('listening')
          break
        case 'response.cancelled':
          setState('listening')
          break
        case 'error':
          onError?.((event as { error?: { message?: string } }).error?.message ?? 'An error occurred')
          setState('idle')
          break
      }
    },
    [onError, onSpeechStarted]
  )

  /**
   * Sends a text message to the tutor and triggers a response.
   * Uses conversation.item.create (input_text) + response.create.
   */
  const sendText = useCallback((text: string) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

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
  }, [])

  /**
   * Sends an image to the tutor and triggers a response.
   * Realtime API expects data:image/{format};base64,{data} for input_image.
   */
  const sendImage = useCallback((base64Data: string, mimeType: string) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

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
  }, [])

  /**
   * Sends text and image together (e.g. "Help me with step 2" + problem image).
   * Both content parts go in a single conversation.item.create message.
   */
  const sendTextWithImage = useCallback(
    (text: string, base64Data: string, mimeType: string) => {
      const dc = dcRef.current
      if (!dc || dc.readyState !== 'open') return

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
    []
  )

  /**
   * Sends canvas image as context only (no response.create).
   * Uses replace strategy: deletes previous canvas item before adding new one.
   */
  const sendCanvasImage = useCallback((base64: string) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

    if (canvasItemIdRef.current) {
      dc.send(
        JSON.stringify({
          type: 'conversation.item.delete',
          item_id: canvasItemIdRef.current,
        })
      )
      canvasItemIdRef.current = null
    }

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
              image_url: `data:image/png;base64,${base64}`,
            },
          ],
        },
      })
    )
  }, [])

  const pause = useCallback(() => {
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = false
      setIsPaused(true)
    }
  }, [])

  const resume = useCallback(() => {
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = true
      setIsPaused(false)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return {
    state,
    isConnected,
    isPaused,
    transcript,
    connect,
    disconnect,
    sendText,
    sendImage,
    sendTextWithImage,
    sendCanvasImage,
    pause,
    resume,
  }
}
