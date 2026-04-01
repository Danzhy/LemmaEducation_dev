/**
 * TutorAvatar Component
 *
 * Visual representation of the tutor with five states:
 * - idle: Ready to connect
 * - listening: User can speak; tutor is waiting for input
 * - waiting: Pause or mute is active; tutor is on hold
 * - thinking: Tutor is processing (e.g. after text/image sent)
 * - speaking: Tutor is responding with voice (shows wave animation)
 *
 * The outer ring changes color/border based on state. The inner circle
 * shows either a microphone icon (idle/listening/waiting/thinking) or animated
 * sound waves (speaking).
 */

'use client'

export type TutorState = 'idle' | 'listening' | 'waiting' | 'thinking' | 'speaking'

interface TutorAvatarProps {
  state: TutorState
  className?: string
}

export default function TutorAvatar({ state, className = '' }: TutorAvatarProps) {
  return (
    <div
      className={`relative w-[7rem] h-[7rem] md:w-[8.75rem] md:h-[8.75rem] rounded-full flex items-center justify-center transition-all duration-500 ${className}`}
      data-state={state}
    >
      {/* Outer ring - pulses when listening, different colors per state */}
      <div
        className={`absolute inset-0 rounded-full border-4 transition-all duration-500 ${
          state === 'idle'
            ? 'border-[#A3B8B2]/40 bg-[#E6ECE9]'
            : state === 'listening'
            ? 'border-[#16423C] bg-[#C4DED8]/30 animate-pulse'
            : state === 'waiting'
            ? 'border-[#A3B8B2]/60 bg-[#D1DBD7]'
            : state === 'thinking'
            ? 'border-[#5C7069] bg-[#D1DBD7]'
            : 'border-[#16423C] bg-[#C4DED8]/50'
        }`}
      />

      {/* Inner circle - microphone icon or speaking waves */}
      <div className="relative w-[5.25rem] h-[5.25rem] md:w-[6.125rem] md:h-[6.125rem] rounded-full bg-[#16423C] flex items-center justify-center overflow-hidden">
        {state === 'speaking' && (
          <div className="absolute inset-0 flex items-center justify-center gap-0.5">
            <span className="w-1 h-3.5 bg-white/90 rounded-full tutor-wave [animation-delay:-0.2s]" />
            <span className="w-1 h-5 bg-white rounded-full tutor-wave [animation-delay:-0.1s]" />
            <span className="w-1 h-4 bg-white/90 rounded-full tutor-wave" />
            <span className="w-1 h-5 bg-white rounded-full tutor-wave [animation-delay:0.1s]" />
            <span className="w-1 h-3.5 bg-white/90 rounded-full tutor-wave [animation-delay:0.2s]" />
          </div>
        )}
        {state !== 'speaking' && (
          <svg
            className="w-[3.5rem] h-[3.5rem] md:w-[4.25rem] md:h-[4.25rem] text-white/90"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zm0 10a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0v-6a2 2 0 0 0-2-2z" />
          </svg>
        )}
      </div>

      {/* State label below the avatar */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span
          className={`text-xs uppercase tracking-widest font-medium transition-colors ${
            state === 'idle'
              ? 'text-[#5C7069]'
              : state === 'listening'
              ? 'text-[#16423C]'
              : state === 'waiting'
              ? 'text-[#3F524C]'
              : state === 'thinking'
              ? 'text-[#3F524C]'
              : 'text-[#16423C]'
          }`}
        >
          {state === 'idle' && 'Ready'}
          {state === 'listening' && 'Listening'}
          {state === 'waiting' && 'Waiting'}
          {state === 'thinking' && 'Thinking'}
          {state === 'speaking' && 'Speaking'}
        </span>
      </div>
    </div>
  )
}
