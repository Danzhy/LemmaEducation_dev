'use client'

import { useState } from 'react'
import CanvasBackground from '@/components/CanvasBackground'
import DemoSection from '@/components/DemoSection'

export default function Home() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Client-side validation
    if (!email.trim()) {
      setStatus('error')
      setMessage('Please enter your email.')
      return
    }

    // Basic email format check on client
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setIsSubmitting(true)
    setStatus('idle')
    setMessage(null)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      // Handle network errors
      if (!res.ok && res.status >= 500) {
        throw new Error('Server error. Please try again later.')
      }

      let data
      try {
        data = await res.json()
      } catch (parseError) {
        throw new Error('Invalid response from server. Please try again.')
      }

      // Handle API errors
      if (!data.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }

      // Success - show message (could be new signup or already on waitlist)
      setStatus('success')
      setMessage(data.message || 'You\'re on the waitlist. We\'ll be in touch soon.')
      setEmail('')
    } catch (err) {
      setStatus('error')
      
      // Provide user-friendly error messages
      if (err instanceof Error) {
        // Check for specific error types
        if (err.message.includes('fetch')) {
          setMessage('Network error. Please check your connection and try again.')
        } else if (err.message.includes('timeout')) {
          setMessage('Request timed out. Please try again.')
        } else {
          setMessage(err.message)
        }
      } else {
        setMessage('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen justify-between">
      {/* The Animated Background */}
      <CanvasBackground />

      {/* Navigation */}
      <nav className="w-full px-6 py-8 md:px-12 flex justify-between items-center fade-in-up">
        <div className="text-2xl tracking-tight font-medium serif italic text-[#16423C]">Lemma.</div>
        <div className="flex gap-6">
          <a href="/tutor" className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors">Try Tutor</a>
          <a href="#waitlist" className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors">Request Access</a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center px-6 md:px-12 py-20 max-w-4xl mx-auto text-center relative z-10">
        
        <p className="fade-in-up uppercase tracking-[0.2em] text-[10px] md:text-xs text-[#5C7069] mb-8">Practice Smarter, Learn Deeper</p>
        
        <h1 className="fade-in-up delay-100 text-6xl md:text-8xl leading-[1.0] font-light serif mb-8 text-[#0F2922]">
          The AI that <br />
          <span className="italic text-[#2C5F56]">listens to you.</span>
        </h1>

        <p className="fade-in-up delay-200 text-lg md:text-xl font-light text-[#3F524C] max-w-2xl leading-relaxed mx-auto">
          Traditional tools just generate answers. We built an interface that asks you to verbalize your thinking while you solve, capturing what you actually understand.
        </p>

        {/* Waitlist */}
        <form
          id="waitlist"
          onSubmit={handleSubmit}
          className="fade-in-up delay-300 mt-16 w-full max-w-md mx-auto flex flex-col md:flex-row gap-4 items-end md:items-center"
        >
          <div className="flex-grow w-full relative">
            <label htmlFor="email" className="sr-only">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email"
              className="minimal-input w-full text-lg font-light"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full md:w-auto px-8 py-3 bg-[#16423C] text-[#F2F5F4] hover:bg-[#0A2621] disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-300 font-medium text-sm rounded-sm shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
          >
            {isSubmitting ? 'Joining...' : 'Join Waitlist'}
          </button>
        </form>

        {message && (
          <p
            className={`mt-4 text-sm fade-in-up ${
              status === 'success' 
                ? 'text-[#16423C]' 
                : 'text-red-600'
            }`}
          >
            {message}
          </p>
        )}

      </main>

      {/* The Vision / Manifesto Section */}
      {/* Added backdrop-blur to make text readable over the canvas animation */}
      <section className="w-full bg-[#E6ECE9]/80 backdrop-blur-md py-24 px-6 md:px-12 border-t border-[#D1DBD7] relative z-10">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 md:gap-24">
          
          {/* Column 1 */}
          <div>
            <h3 className="serif text-3xl italic mb-6 text-[#0F2922]">Beyond the Answer</h3>
            <p className="text-[#3F524C] leading-relaxed mb-4 font-light">
              Students today learn procedures instead of concepts. When they get stuck, they often face &quot;eroding confidence&quot; because systems only check if the final output is correct.
            </p>
            <p className="text-[#3F524C] leading-relaxed font-light">
              We believe assessment needs to probe thinking, not just answers.
            </p>
          </div>

          {/* Column 2 */}
          <div>
            <h3 className="serif text-3xl italic mb-6 text-[#0F2922]">Reasoning Out Loud</h3>
            <p className="text-[#3F524C] leading-relaxed mb-4 font-light">
              Lemma works at the pace of understanding, not curriculum timelines. By using voice reasoning and digital handwriting, we capture the complete picture of a student&apos;s thought process.
            </p>
            <p className="text-[#3F524C] leading-relaxed font-light">
              Real-time feedback targets misconceptions in logic, mirroring the experience of an expert human tutor.
            </p>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <DemoSection />

      {/* Footer */}
      <footer className="w-full px-6 py-12 md:px-12 border-t border-[#D1DBD7] bg-[#F2F5F4] relative z-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
          
          <div>
            <h4 className="uppercase tracking-widest text-[10px] font-bold text-[#5C7069] mb-4">The Team</h4>
            <ul className="space-y-1 text-sm text-[#3F524C] font-light">
              <li>
                <a 
                  href="https://www.linkedin.com/in/shayanahmad7/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-[#16423C] transition-colors"
                >
                  Shayan Ahmad
                </a>
              </li>
              <li>
                <a 
                  href="https://www.linkedin.com/in/myrarafiq/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-[#16423C] transition-colors"
                >
                  Myra Rafiq
                </a>
              </li>
              <li>
                <a 
                  href="https://www.linkedin.com/in/vlera-mehani-a11a56178/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-[#16423C] transition-colors"
                >
                  Vlera Mehani
                </a>
              </li>
              <li>
                <a 
                  href="https://www.linkedin.com/in/daniar-zhylangozov/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-[#16423C] transition-colors"
                >
                  Daniar Zhylangozov
                </a>
              </li>
            </ul>
          </div>

          <div className="text-left md:text-right">
            <p className="serif italic text-xl mb-2 text-[#16423C]">LemmaEducation</p>
            <p className="text-[10px] text-[#5C7069] tracking-wide">© 2026 Lemma Education.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
