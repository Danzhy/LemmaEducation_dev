'use client'

import { useState } from 'react'

const roleOptions = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
] as const

const gradeOptions = ['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7']

function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="mt-2 text-sm text-red-700">{message}</p>
}

function FormAlert({
  message,
  tone = 'error',
}: {
  message: string | null
  tone?: 'error' | 'success'
}) {
  if (!message) return null
  return (
    <div
      className={`rounded-[18px] border px-4 py-3 text-sm ${
        tone === 'success'
          ? 'border-[#CFE1DB] bg-[#EEF5F2] text-[#16423C]'
          : 'border-red-200 bg-red-50 text-red-700'
      }`}
      role="alert"
    >
      {message}
    </div>
  )
}

export function OnboardingForm({
  initialName,
  initialEmail,
}: {
  initialName: string
  initialEmail: string | null
}) {
  const [role, setRole] = useState<'student' | 'teacher' | 'parent'>('student')
  const [displayName, setDisplayName] = useState(initialName)
  const [gradeLevel, setGradeLevel] = useState('Grade 6')
  const [schoolName, setSchoolName] = useState('')
  const [classJoinCode, setClassJoinCode] = useState('')
  const [studentAccessCode, setStudentAccessCode] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (displayName.trim().length < 2) {
      setError('Please enter a name with at least 2 characters.')
      return
    }

    if (!privacyAccepted || !consentAccepted) {
      setError('Please accept the privacy and pilot data notices.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/profile/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          displayName,
          gradeLevel,
          schoolName,
          classJoinCode,
          studentAccessCode,
          privacyAccepted,
          consentAccepted,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not save your profile. Please try again.')
        return
      }

      window.location.replace('/dashboard')
    } catch {
      setError('Could not save your profile. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Name</span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="w-full rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
            placeholder="Your name"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Email</span>
          <input
            type="email"
            value={initialEmail ?? ''}
            readOnly
            className="w-full rounded-[18px] border border-[#D5E1DD] bg-[#F7FAF8] px-4 py-3 text-[#6B7F79] outline-none"
          />
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as 'student' | 'teacher' | 'parent')}
            className="w-full rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {role === 'student' ? (
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Grade level</span>
            <select
              value={gradeLevel}
              onChange={(event) => setGradeLevel(event.target.value)}
              className="w-full rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
            >
              {gradeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">
              {role === 'teacher' ? 'School or organization' : 'Student access code'}
            </span>
            <input
              type="text"
              value={role === 'teacher' ? schoolName : studentAccessCode}
              onChange={(event) =>
                role === 'teacher'
                  ? setSchoolName(event.target.value)
                  : setStudentAccessCode(event.target.value.toUpperCase())
              }
              className="w-full rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
              placeholder={role === 'teacher' ? 'School name (optional)' : 'LP-XXXXXXX'}
            />
          </label>
        )}
      </div>

      {role === 'student' ? (
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">
            Class join code
          </span>
          <input
            type="text"
            value={classJoinCode}
            onChange={(event) => setClassJoinCode(event.target.value.toUpperCase())}
            className="w-full rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
            placeholder="Optional classroom code from your teacher"
          />
        </label>
      ) : null}

      <div className="space-y-3 rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4 text-sm leading-relaxed text-[#4D625C]">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(event) => setPrivacyAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-[#B8C8C2] text-[#16423C]"
          />
          <span>
            I understand that tutoring sessions may be stored so authorized users can review
            student work later.
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-[#B8C8C2] text-[#16423C]"
          />
          <span>
            I understand Lemma is being used in a limited pilot and session data may be reviewed
            to improve the product and support student safety.
          </span>
        </label>
      </div>

      <FormAlert message={error} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-full border border-[#143C36] bg-[#12352F] px-6 py-3 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Saving...' : 'Continue'}
      </button>
    </form>
  )
}

export function CreateClassForm() {
  const [name, setName] = useState('')
  const [gradeLabel, setGradeLabel] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    if (name.trim().length < 2) {
      setError('Please enter a class name.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gradeLabel, schoolName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not create class.')
        return
      }

      setMessage(`Class created. Join code: ${data.joinCode}`)
      setName('')
      setGradeLabel('')
      window.location.reload()
    } catch {
      setError('Could not create class.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[24px] border border-[#DCE7E2] bg-white/82 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="Class name"
        />
        <input
          value={gradeLabel}
          onChange={(event) => setGradeLabel(event.target.value)}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="Grade band (optional)"
        />
        <input
          value={schoolName}
          onChange={(event) => setSchoolName(event.target.value)}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="School (optional)"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full border border-[#143C36] bg-[#12352F] px-5 py-2.5 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating...' : 'Create class'}
        </button>
        {message ? <span className="text-sm text-[#16423C]">{message}</span> : null}
      </div>
      <FieldError message={error} />
    </form>
  )
}

export function JoinClassForm() {
  const [joinCode, setJoinCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)
    if (!joinCode.trim()) {
      setError('Enter your classroom code.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/classrooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not join class.')
        return
      }
      setMessage(`Joined ${data.classroom.name}.`)
      setJoinCode('')
      window.location.reload()
    } catch {
      setError('Could not join class.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-[24px] border border-[#DCE7E2] bg-white/82 p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          className="flex-1 rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="Enter a teacher’s class code"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full border border-[#143C36] bg-[#12352F] px-5 py-2.5 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Joining...' : 'Join class'}
        </button>
      </div>
      <FormAlert message={message} tone="success" />
      <FieldError message={error} />
    </form>
  )
}

export function StudentAccessCodeCard({ initialCode }: { initialCode: string | null }) {
  const [code, setCode] = useState(initialCode)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleGenerate = async () => {
    setMessage(null)
    setError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/student-access-codes', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not create a parent access code.')
        return
      }
      setCode(data.code.code)
      setMessage('New parent access code created.')
    } catch {
      setError('Could not create a parent access code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-[24px] border border-[#DCE7E2] bg-white/82 p-5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Parent access</p>
      <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">Share a read-only code</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#5C7069]">
        A parent can use this code to connect to your saved session history without getting edit access.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="rounded-[16px] border border-[#D5E1DD] bg-[#F7FAF8] px-4 py-3 font-medium tracking-[0.12em] text-[#16423C]">
          {code ?? 'No active code yet'}
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isSubmitting}
          className="rounded-full border border-[#143C36] bg-[#12352F] px-5 py-2.5 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Generating...' : code ? 'Rotate code' : 'Generate code'}
        </button>
      </div>
      <FormAlert message={message} tone="success" />
      <FieldError message={error} />
    </div>
  )
}

export function LinkStudentForm() {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    if (!code.trim()) {
      setError('Enter a student access code.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/student-access-codes/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not connect student.')
        return
      }
      setMessage('Student linked successfully.')
      setCode('')
      window.location.reload()
    } catch {
      setError('Could not connect student.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-[24px] border border-[#DCE7E2] bg-white/82 p-5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Link a student</p>
      <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">Add read-only oversight</h3>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="flex-1 rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="LP-XXXXXXX"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full border border-[#143C36] bg-[#12352F] px-5 py-2.5 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Linking...' : 'Link student'}
        </button>
      </div>
      <FormAlert message={message} tone="success" />
      <FieldError message={error} />
    </form>
  )
}
