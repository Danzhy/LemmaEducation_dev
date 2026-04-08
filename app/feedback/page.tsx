'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'

export default function FeedbackPage() {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [rating, setRating] = useState<number | ''>('')
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const send = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed) return
    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          email: email.trim() || undefined,
          rating: rating === '' ? undefined : rating,
          pageContext: 'feedback',
          website,
        }),
      })
      if (!res.ok) {
        setStatus('error')
        return
      }
      setStatus('sent')
      setMessage('')
      setEmail('')
      setRating('')
      setWebsite('')
    } catch {
      setStatus('error')
    }
  }, [email, message, rating, website])

  return (
    <div className="min-h-screen bg-[#F2F5F4] text-[#16423C] px-6 py-12 md:px-12">
      <div className="max-w-lg mx-auto">
        <div className="flex justify-between items-center gap-4 mb-10">
          <Link href="/" className="text-sm uppercase tracking-widest text-[#3F524C] hover:text-[#16423C]">
            ← Home
          </Link>
          <Link href="/tutor" className="text-sm uppercase tracking-widest text-[#3F524C] hover:text-[#16423C]">
            Tutor
          </Link>
        </div>

        <h1 className="text-3xl font-medium serif italic mb-2">Feedback</h1>
        <p className="text-sm text-[#5C7069] mb-8">
          Tell us what works, what does not, or what you would like next.
        </p>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <div className="hidden" aria-hidden>
            <label>
              Leave blank
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[#5C7069] mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full border border-[#A3B8B2] rounded-sm px-3 py-2 text-[#16423C] bg-white focus:ring-[#16423C] focus:border-[#16423C]"
              placeholder="Your feedback..."
              maxLength={8000}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[#5C7069] mb-2">Rating (optional)</label>
            <select
              value={rating === '' ? '' : String(rating)}
              onChange={(e) => setRating(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border border-[#A3B8B2] rounded-sm px-3 py-2 text-[#16423C] bg-white"
            >
              <option value="">—</option>
              <option value="5">5 — Excellent</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1 — Poor</option>
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[#5C7069] mb-2">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#A3B8B2] rounded-sm px-3 py-2 text-[#16423C] bg-white"
              placeholder="you@example.com"
              maxLength={320}
            />
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-700">Could not send feedback. Please try again.</p>
          )}
          {status === 'sent' && (
            <p className="text-sm text-[#16423C]">Thank you — we received your feedback.</p>
          )}

          <button
            type="submit"
            disabled={status === 'sending' || !message.trim()}
            className="px-5 py-2.5 bg-[#16423C] text-[#F2F5F4] rounded-sm hover:bg-[#0A2621] disabled:opacity-50 text-sm font-medium"
          >
            {status === 'sending' ? 'Sending...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </div>
  )
}
