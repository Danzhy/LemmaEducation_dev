'use client'

import { useState, useRef, useEffect } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TutorChatWindowProps {
  messages: ChatMessage[]
  currentUserTranscript?: string
  currentTranscript: string
  isAssistantStreaming?: boolean
  paused?: boolean
  className?: string
}

export default function TutorChatWindow({
  messages,
  currentUserTranscript = '',
  currentTranscript,
  isAssistantStreaming = false,
  paused = false,
  className = '',
}: TutorChatWindowProps) {
  const [showScrollHint, setShowScrollHint] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, currentTranscript, currentUserTranscript])

  const hasContent =
    messages.length > 0 ||
    currentUserTranscript.trim().length > 0 ||
    (isAssistantStreaming && currentTranscript.trim().length > 0) ||
    paused

  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12
      setShowScrollHint(!nearBottom)
    }
    onScroll()
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-[#DCE7E2] bg-[rgba(255,255,255,0.74)] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[#E6ECE9] bg-white/55 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Session feed</p>
          <p className="mt-1 text-xs text-[#7A8C86]">Scroll through each prompt and response while you work.</p>
        </div>
        {showScrollHint ? (
          <button
            type="button"
            onClick={() => {
              if (!scrollRef.current) return
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }}
            className="text-[10px] uppercase tracking-[0.2em] text-[#5C7069] transition-colors hover:text-[#16423C]"
          >
            Jump to latest
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-3 min-h-[220px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-[20px] px-3.5 py-2.5 text-sm leading-relaxed shadow-[0_14px_38px_-26px_rgba(15,41,34,0.22)] ${
                msg.role === 'user'
                  ? 'rounded-br-md bg-[#16423C] text-white'
                  : 'rounded-bl-md border border-[#E6ECE9] bg-[#F4F7F5] text-[#314640]'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {currentUserTranscript.trim() ? (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-[#16423C]/88 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-[0_14px_38px_-26px_rgba(15,41,34,0.22)]">
              {currentUserTranscript}
            </div>
          </div>
        ) : null}

        {isAssistantStreaming && currentTranscript.trim() ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[20px] rounded-bl-md border border-[#E6ECE9] bg-[#F4F7F5] px-3.5 py-2.5 text-sm leading-relaxed text-[#314640] shadow-[0_14px_38px_-26px_rgba(15,41,34,0.22)]">
              {currentTranscript}
            </div>
          </div>
        ) : null}

        {!hasContent ? (
          <p className="py-2 text-sm leading-relaxed text-[#5C7069]">
            Start by speaking, typing, or uploading a problem. The conversation will stay scrollable here while the board remains in focus.
          </p>
        ) : null}
      </div>
    </div>
  )
}
