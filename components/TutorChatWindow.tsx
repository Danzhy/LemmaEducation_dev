'use client'

import { useState, useRef, useEffect } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TutorChatWindowProps {
  messages: ChatMessage[]
  currentTranscript: string
  isAssistantStreaming?: boolean
  paused?: boolean
  className?: string
}

export default function TutorChatWindow({
  messages,
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
  }, [messages, currentTranscript])

  const hasContent = messages.length > 0 || (isAssistantStreaming && currentTranscript.trim().length > 0) || paused

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
    <div className={`flex flex-col rounded-lg border border-[#E6ECE9] bg-white/70 overflow-hidden text-left ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E6ECE9] bg-white/60">
        <p className="text-xs uppercase tracking-wider text-[#5C7069]">Session Chat</p>
        {showScrollHint ? (
          <button
            type="button"
            onClick={() => {
              if (!scrollRef.current) return
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }}
            className="text-[10px] uppercase tracking-wider text-[#5C7069] hover:text-[#16423C]"
          >
            Jump to latest
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[220px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#16423C] text-white rounded-br-sm'
                  : 'bg-white border border-[#E6ECE9] text-[#3F524C] rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isAssistantStreaming && currentTranscript.trim() ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed bg-white border border-[#E6ECE9] text-[#3F524C]">
              {currentTranscript}
            </div>
          </div>
        ) : null}

        {!hasContent ? (
          <p className="text-sm text-[#5C7069] py-2">Start by speaking, typing, or uploading a problem.</p>
        ) : null}
      </div>
    </div>
  )
}
