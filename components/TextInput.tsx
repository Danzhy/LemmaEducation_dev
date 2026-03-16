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

import { useState } from 'react'

interface TextInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export default function TextInput({
  onSend,
  disabled = false,
  placeholder = 'Type equations, steps, or clarifications...',
  className = '',
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

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 minimal-input px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-[#16423C] text-[#F2F5F4] rounded-sm hover:bg-[#0A2621] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          Send
        </button>
      </div>
    </form>
  )
}
