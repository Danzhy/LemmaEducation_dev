'use client'

import { useState } from 'react'
import CanvasBackground from '@/components/CanvasBackground'
import DemoSection from '@/components/DemoSection'

const roleOptions = [
  'Student',
  'Parent',
  'Teacher',
  'Tutor',
  'Researcher',
  'School leader',
  'Other',
]

type WaitlistForm = {
  email: string
  roleSelection: string
  customRole: string
  goals: string
  willingToPay: boolean
}

export default function Home() {
  const [formData, setFormData] = useState<WaitlistForm>({
    email: '',
    roleSelection: '',
    customRole: '',
    goals: '',
    willingToPay: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const updateField = <K extends keyof WaitlistForm>(field: K, value: WaitlistForm[K]) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmedEmail = formData.email.trim()
    const trimmedCustomRole = formData.customRole.trim()
    const trimmedGoals = formData.goals.trim()
    const trimmedRoleSelection = formData.roleSelection.trim()

    // Client-side validation
    if (!trimmedEmail) {
      setStatus('error')
      setMessage('Please enter your email.')
      return
    }

    // Basic email format check on client
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    if (!trimmedRoleSelection) {
      setStatus('error')
      setMessage('Please choose the option that best describes you.')
      return
    }

    if (!trimmedGoals) {
      setStatus('error')
      setMessage('Please tell us how you would want to use Lemma.')
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
        body: JSON.stringify({
          email: trimmedEmail,
          roleSelection: trimmedRoleSelection,
          customRole: trimmedCustomRole,
          goals: trimmedGoals,
          willingToPay: formData.willingToPay,
        }),
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
      setMessage(data.message || 'You\'re on the list. We’ll follow up when we start opening access.')
      setFormData({
        email: '',
        roleSelection: '',
        customRole: '',
        goals: '',
        willingToPay: false,
      })
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

        <a
          href="#waitlist"
          className="waitlist-ui-text fade-in-up delay-300 mt-16 inline-flex items-center justify-center rounded-full border border-[#143C36] bg-[#12352F] px-7 py-3.5 text-[0.95rem] font-light text-[#F2F5F4] shadow-[0_12px_28px_-20px_rgba(15,41,34,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#16423C]"
        >
          Join the waitlist
        </a>

      </main>

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

      <section id="waitlist" className="relative z-10 bg-[#DDE7E3] px-6 py-16 md:px-12">
        <div className="mx-auto max-w-[58rem] overflow-hidden rounded-[1.35rem] border border-[#C4D1CC] bg-[#E9EFEC] shadow-[0_18px_42px_-34px_rgba(15,41,34,0.28)]">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-[#D1DBD7] px-6 py-7 md:px-8 lg:border-b-0 lg:border-r lg:py-8">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.28em] text-[#5C7069]">
                Waitlist
              </p>
              <h2 className="serif text-[1.85rem] leading-tight text-[#0F2922] md:text-[2.25rem]">
                Get on the list
                <br />
                before we open up.
              </h2>
              <p className="mt-4 max-w-md text-[0.97rem] font-light leading-relaxed text-[#3F524C]">
                Tell us who you are and how you would use Lemma.
              </p>
            </div>

            <div className="px-6 py-7 md:px-8 lg:py-8">
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="waitlist-field">
                  <label htmlFor="email" className="sr-only">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Email address"
                    className="waitlist-input"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="waitlist-field">
                  <label htmlFor="role" className="sr-only">
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    className="waitlist-input"
                    value={formData.roleSelection}
                    onChange={(e) => updateField('roleSelection', e.target.value)}
                    disabled={isSubmitting}
                    required
                  >
                    <option value="">I’m a student, parent, teacher, tutor...</option>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="waitlist-field">
                  <label htmlFor="customRole" className="sr-only">
                    Custom role
                  </label>
                  <input
                    type="text"
                    id="customRole"
                    name="customRole"
                    placeholder="Your role, background, or organization"
                    className="waitlist-input"
                    value={formData.customRole}
                    onChange={(e) => updateField('customRole', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="waitlist-field">
                  <label htmlFor="goals" className="sr-only">
                    How would you use Lemma
                  </label>
                  <textarea
                    id="goals"
                    name="goals"
                    placeholder="What would you want to use Lemma for, or what feedback would you have for us?"
                    className="waitlist-input min-h-[128px] resize-y"
                    value={formData.goals}
                    onChange={(e) => updateField('goals', e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <label className="waitlist-ui-text flex items-center gap-3 rounded-[1rem] border border-[#B8C8C2] bg-[#E6EEEA] px-4 py-3 text-left text-[#0F2922]">
                  <input
                    type="checkbox"
                    checked={formData.willingToPay}
                    onChange={(e) => updateField('willingToPay', e.target.checked)}
                    disabled={isSubmitting}
                    className="h-4.5 w-4.5 rounded border-[#A3B8B2] text-[#16423C] focus:ring-[#16423C]"
                  />
                  <span className="text-[0.95rem] font-light text-[#0F2922]">I’d be open to paying for it.</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="waitlist-ui-text w-full rounded-[1rem] border border-[#143C36] bg-[#12352F] px-5 py-3.5 text-[0.95rem] font-light text-[#F2F5F4] shadow-[0_14px_32px_-22px_rgba(15,41,34,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving your spot...' : 'Join waitlist'}
                </button>

                <p className="waitlist-ui-text px-1 text-[0.82rem] font-light text-[#5C7069]">
                  Use a real email and a short, specific note. We review early access requests by hand.
                </p>

                {message && (
                  <p
                    className={`waitlist-ui-text px-1 text-sm ${
                      status === 'success' ? 'text-[#16423C]' : 'text-red-600'
                    }`}
                  >
                    {message}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

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
