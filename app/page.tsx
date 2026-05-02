'use client'

import { useEffect, useState } from 'react'
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

const revealDelayClasses = ['', 'reveal-delay-100', 'reveal-delay-200']

const problemSignals = [
  {
    figure: '44%',
    title: 'of children globally achieve minimum proficiency in mathematics by the end of primary school.',
  },
  {
    figure: '15-point drop',
    title: 'in OECD-average math performance in PISA 2022 compared with 2018.',
  },
  {
    figure: '1:1 tutoring works',
    title: 'but it is too expensive and scarce to reach every student.',
  },
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

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))

    if (!nodes.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
      }
    )

    nodes.forEach((node) => observer.observe(node))

    return () => observer.disconnect()
  }, [])

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

    if (!trimmedEmail) {
      setStatus('error')
      setMessage('Please enter your email.')
      return
    }

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

      if (!res.ok && res.status >= 500) {
        throw new Error('Server error. Please try again later.')
      }

      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('Invalid response from server. Please try again.')
      }

      if (!data.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }

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

      if (err instanceof Error) {
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
    <div className="flex min-h-screen flex-col justify-between">
      <CanvasBackground />

      <nav className="fade-in-up flex w-full items-center justify-between px-6 py-8 md:px-12">
        <div className="text-2xl font-medium tracking-tight serif italic text-[#16423C]">Lemma.</div>
        <div className="flex items-center gap-4 md:gap-6">
          <a
            href="#demo"
            className="text-[10px] uppercase tracking-[0.22em] text-[#5C7069] transition-colors hover:text-[#16423C]"
          >
            Watch Demo
          </a>
          <a
            href="#waitlist"
            className="waitlist-ui-text inline-flex items-center rounded-full border border-[#AFC0BA] px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#16423C] transition-colors hover:border-[#16423C] hover:bg-white/60"
          >
            Request Access
          </a>
        </div>
      </nav>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-grow flex-col items-center justify-center px-6 py-20 text-center md:px-12">
        <p className="fade-in-up mb-8 text-[10px] uppercase tracking-[0.2em] text-[#5C7069] md:text-xs">
          Making student thinking visible in math.
        </p>

        <h1 className="fade-in-up delay-100 mb-8 text-6xl font-light leading-[1] serif text-[#0F2922] md:text-8xl">
          The AI that <br />
          <span className="italic text-[#2C5F56]">listens to you.</span>
        </h1>

        <p className="fade-in-up delay-200 mx-auto max-w-2xl text-lg font-light leading-relaxed text-[#3F524C] md:text-xl">
          Traditional tools just generate answers. Lemma is a voice AI math tutor that
          listens to students&apos; reasoning while they solve and gives real-time feedback.
        </p>

        <div className="fade-in-up delay-300 mt-12 flex flex-col items-center gap-4 sm:flex-row">
          <a
            href="#waitlist"
            className="waitlist-ui-text inline-flex items-center justify-center rounded-full border border-[#143C36] bg-[#12352F] px-7 py-3.5 text-[0.95rem] font-light text-[#F2F5F4] shadow-[0_12px_28px_-20px_rgba(15,41,34,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#16423C]"
          >
            Join the waitlist
          </a>
          <a
            href="#demo"
            className="waitlist-ui-text inline-flex items-center justify-center rounded-full border border-[#B8C8C2] bg-[#ECF1EE] px-7 py-3.5 text-[0.95rem] font-light text-[#16423C] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#9FB2AB] hover:bg-white"
          >
            Watch demo
          </a>
        </div>
      </main>

      <section className="relative z-10 border-t border-[#D1DBD7] bg-[#E6ECE9]/80 px-6 py-24 backdrop-blur-md md:px-12">
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[0.94fr_1.06fr] lg:gap-20">
          <div data-reveal className="reveal-fade-rise">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[#5C7069]">
              The Problem
            </p>
            <h2 className="serif text-[2.35rem] leading-tight text-[#0F2922] md:text-[3rem]">
              Math learning is still
              <br />
              a global problem.
            </h2>
            <p className="mt-6 max-w-xl text-[1rem] font-light leading-relaxed text-[#3F524C] md:text-[1.05rem]">
              Across the world, students struggle with math, and the gap compounds over
              time.
            </p>
          </div>

          <div className="space-y-0">
            {problemSignals.map((signal, index) => (
              <article
                key={signal.figure}
                data-reveal
                className={`reveal-fade-rise ${revealDelayClasses[index]} border-t border-[#CCD7D3] py-5 first:pt-0`}
              >
                <p className="text-[1.6rem] font-light tracking-[-0.04em] text-[#0F2922] md:text-[1.95rem]">
                  {signal.figure}
                </p>
                <p className="mt-2 max-w-lg text-[0.94rem] font-light leading-relaxed text-[#0F2922]">
                  {signal.title}
                </p>
              </article>
            ))}
          </div>
        </div>

        <p
          data-reveal
          className="reveal-fade-rise reveal-delay-200 mx-auto mt-8 max-w-6xl text-[10px] uppercase tracking-[0.22em] text-[#7A8D87]"
        >
          Sources: UNESCO Institute for Statistics, OECD PISA 2022, NBER tutoring
          meta-analysis, Education Endowment Foundation.
        </p>
      </section>

      <section className="relative z-10 border-t border-[#D1DBD7] bg-[#F2F5F4] px-6 py-24 md:px-12">
        <div className="mx-auto max-w-6xl">
          <div data-reveal className="reveal-fade-rise lg:grid lg:grid-cols-[0.94fr_1.06fr] lg:gap-20 lg:items-start">
            <div>
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[#5C7069]">
                Root Cause
              </p>
              <h2 className="serif text-[2.3rem] leading-tight text-[#0F2922] md:text-[3rem]">
                We don’t see how students think,
                <br />
                only what they answer.
              </h2>
            </div>
            <div className="mt-6 lg:mt-1">
              <p className="max-w-xl text-[1rem] font-light leading-relaxed text-[#3F524C] md:text-[1.05rem]">
                Most classrooms, worksheets, and software only capture the result. They
                rarely capture the explanation or work that reveals what a student
                actually understands.
              </p>
              <p className="mt-4 max-w-xl text-[1rem] font-light leading-relaxed text-[#3F524C] md:text-[1.05rem]">
                That is why students often get feedback too late. Good tutors work
                differently. They respond during the process, not after it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-[#D1DBD7] bg-[#E8EFEC] px-6 py-24 md:px-12">
        <div className="mx-auto max-w-6xl">
          <div data-reveal className="reveal-fade-rise lg:grid lg:grid-cols-[0.94fr_1.06fr] lg:gap-20 lg:items-start">
            <div>
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[#5C7069]">
                The Solution
              </p>
              <h2 className="serif text-[2.3rem] leading-tight text-[#0F2922] md:text-[3rem]">
                Getting closer to
                <br />
                a good human tutor.
              </h2>
            </div>
            <div className="mt-6 lg:mt-1">
              <p className="max-w-xl text-[1rem] font-light leading-relaxed text-[#3F524C] md:text-[1.05rem]">
                Lemma is a voice AI tutor built specifically for math. It listens to
                students, follows the work on a shared canvas, and responds in real
                time.
              </p>
              <p className="mt-4 max-w-xl text-[1rem] font-light leading-relaxed text-[#3F524C] md:text-[1.05rem]">
                Our goal is to get as close as we can to a strong human tutor by
                listening, watching, and guiding while the student is still solving.
              </p>
            </div>
          </div>
        </div>
      </section>

      <DemoSection />

      <section id="waitlist" className="relative z-10 bg-[#DDE7E3] px-6 py-16 md:px-12">
        <div className="mx-auto max-w-[58rem] overflow-hidden rounded-[1.35rem] border border-[#C4D1CC] bg-[#E9EFEC] shadow-[0_18px_42px_-34px_rgba(15,41,34,0.28)]">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-[#D1DBD7] px-6 py-7 md:px-8 lg:border-b-0 lg:border-r lg:py-8">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.28em] text-[#5C7069]">
                Waitlist
              </p>
              <h2 className="serif text-[1.85rem] leading-tight text-[#0F2922] md:text-[2.25rem]">
                Get early access
                <br />
                before we open up.
              </h2>
              <p className="mt-4 max-w-md text-[0.97rem] font-light leading-relaxed text-[#3F524C]">
                Tell us who you are and how you would use Lemma. We are inviting early
                users by hand.
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
                    <option value="">Role</option>
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
                    placeholder="How would you use Lemma?"
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
                  <span className="text-[0.95rem] font-light text-[#0F2922]">
                    I’d be open to giving feedback after trying it.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="waitlist-ui-text w-full rounded-[1rem] border border-[#143C36] bg-[#12352F] px-5 py-3.5 text-[0.95rem] font-light text-[#F2F5F4] shadow-[0_14px_32px_-22px_rgba(15,41,34,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving your spot...' : 'Join waitlist'}
                </button>

                <p className="waitlist-ui-text px-1 text-[0.82rem] font-light text-[#5C7069]">
                  Use a real email and a short, specific note. We review early access
                  requests by hand.
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

      <footer
        id="team"
        className="relative z-10 w-full border-t border-[#D1DBD7] bg-[#F2F5F4] px-6 py-12 md:px-12"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#5C7069]">
              The Team
            </h4>
            <ul className="space-y-1 text-sm font-light text-[#3F524C]">
              <li>
                <a
                  href="https://www.linkedin.com/in/shayanahmad7/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#16423C]"
                >
                  Shayan Ahmad
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/myrarafiq/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#16423C]"
                >
                  Myra Rafiq
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/vlera-mehani-a11a56178/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#16423C]"
                >
                  Vlera Mehani
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/daniar-zhylangozov/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#16423C]"
                >
                  Daniar Zhylangozov
                </a>
              </li>
            </ul>
          </div>

          <div className="text-left md:text-right">
            <p className="serif mb-2 text-xl italic text-[#16423C]">LemmaEducation</p>
            <p className="text-sm font-light text-[#5C7069]">
              Making student thinking visible in math.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
