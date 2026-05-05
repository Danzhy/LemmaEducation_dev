/**
 * TextInput Component
 *
 * Allows users to type equations, steps, or clarifications to send to the tutor.
 * Used for Phase 1.3: text input alongside voice. The tutor responds with voice
 * (audio output); text is input only.
 *
 * Can be used alone (text-only mode) or combined with voice and file upload.
 */

'use client'

import { useState, type ReactNode } from 'react'

interface TextInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  leadingAccessory?: ReactNode
}

export default function TextInput({
  onSend,
  disabled = false,
  placeholder = 'Type equations, steps, or clarifications...',
  className = '',
  leadingAccessory,
}: TextInputProps) {
  const [value, setValue] = useState('')

  /**
   * Submits the typed text. If an image is pending (handled by parent),
   * the parent's onSend will combine text + image. Otherwise text-only.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed && !disabled) {
      onSend(trimmed)
      setValue('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed && !disabled) {
        onSend(trimmed)
        setValue('')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex items-end gap-2 rounded-[22px] border border-[#D5E1DD] bg-white/78 p-2 shadow-[0_16px_42px_-30px_rgba(15,41,34,0.35)] transition-colors focus-within:border-[#16423C]">
        {leadingAccessory ? <div className="flex-shrink-0">{leadingAccessory}</div> : null}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className="min-h-[48px] flex-1 resize-none bg-transparent px-3 py-2 text-[13px] leading-5 text-[#0F2922] outline-none placeholder:text-[#8CA39D] md:text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-[#16423C] px-4 py-2.5 text-sm font-medium text-[#F2F5F4] transition-all hover:-translate-y-0.5 hover:bg-[#0A2621] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h11m0 0l-4-4m4 4l-4 4" />
          </svg>
          Send
        </button>
      </div>
    </form>
  )
}
