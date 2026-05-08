'use client'

import { useState } from 'react'

const roleOptions = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
] as const

const gradeOptions = ['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7']

export type DashboardClassOption = {
  id: string
  name: string
  gradeLabel?: string | null
}

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

export function CurriculumDocumentForm({ classrooms }: { classrooms: DashboardClassOption[] }) {
  const [title, setTitle] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '')
  const [visibility, setVisibility] = useState<'teacher_private' | 'classroom'>(
    classrooms.length > 0 ? 'classroom' : 'teacher_private'
  )
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    if (file.size > 500_000) {
      setError('Use a text file under 500 KB for now.')
      return
    }

    try {
      const text = await file.text()
      setSourceText(text)
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 120))
      }
      setSourceName(file.name.slice(0, 180))
    } catch {
      setError('Could not read that file. Paste the text instead.')
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    if (title.trim().length < 2) {
      setError('Add a short title.')
      return
    }
    if (sourceText.trim().length < 40) {
      setError('Paste at least a short page of lesson or worksheet text.')
      return
    }
    if (visibility === 'classroom' && !classroomId) {
      setError('Choose a class or keep the document private.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/curriculum/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sourceName,
          sourceText,
          classroomId: visibility === 'classroom' ? classroomId : '',
          visibility,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not save curriculum.')
        return
      }

      setMessage(`Curriculum saved with ${data.chunks} searchable section${data.chunks === 1 ? '' : 's'}.`)
      setTitle('')
      setSourceName('')
      setSourceText('')
      window.location.reload()
    } catch {
      setError('Could not save curriculum.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[24px] border border-[#DCE7E2] bg-white/82 p-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Curriculum context</p>
        <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">Upload lesson notes</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#5C7069]">
          Hidden lab tutors can search this text before answering class-specific questions.
        </p>
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
        placeholder="Document title"
      />
      <input
        value={sourceName}
        onChange={(event) => setSourceName(event.target.value)}
        className="w-full rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
        placeholder="Source name (optional)"
      />

      <label className="block rounded-[18px] border border-dashed border-[#B8C8C2] bg-[#F8FBF9] px-4 py-4 text-sm text-[#5C7069]">
        <span className="block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Upload text file</span>
        <span className="mt-2 block">Optional. Supports small `.txt`, `.md`, or copied worksheet text files.</span>
        <input
          type="file"
          accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown"
          onChange={(event) => void handleFileUpload(event)}
          className="mt-3 block w-full text-sm text-[#14312A] file:mr-4 file:rounded-full file:border-0 file:bg-[#12352F] file:px-4 file:py-2 file:text-sm file:text-[#F2F5F4]"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as 'teacher_private' | 'classroom')}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
        >
          <option value="teacher_private">Private to me</option>
          <option value="classroom" disabled={classrooms.length === 0}>
            Share with a class
          </option>
        </select>
        <select
          value={classroomId}
          onChange={(event) => setClassroomId(event.target.value)}
          disabled={visibility !== 'classroom' || classrooms.length === 0}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C] disabled:opacity-60"
        >
          {classrooms.length === 0 ? <option value="">Create a class first</option> : null}
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={sourceText}
        onChange={(event) => setSourceText(event.target.value)}
        rows={8}
        className="w-full resize-y rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
        placeholder="Paste lesson notes, worksheet text, rubric language, or a short curriculum excerpt."
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full border border-[#143C36] bg-[#12352F] px-5 py-2.5 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Save curriculum'}
        </button>
        <FormAlert message={message} tone="success" />
      </div>
      <FieldError message={error} />
    </form>
  )
}

export function TutorProfileForm({ classrooms }: { classrooms: DashboardClassOption[] }) {
  const [name, setName] = useState('')
  const [gradeBand, setGradeBand] = useState('Grades 3-7')
  const [instructions, setInstructions] = useState('')
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '')
  const [scope, setScope] = useState<'teacher_private' | 'classroom'>(
    classrooms.length > 0 ? 'classroom' : 'teacher_private'
  )
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    if (name.trim().length < 2) {
      setError('Add a profile name.')
      return
    }
    if (instructions.trim().length < 20) {
      setError('Add specific tutor instructions.')
      return
    }
    if (scope === 'classroom' && !classroomId) {
      setError('Choose a class or keep the profile private.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/tutor/agent-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          gradeBand,
          instructions,
          classroomId: scope === 'classroom' ? classroomId : '',
          scope,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not save tutor profile.')
        return
      }

      setMessage('Tutor profile saved.')
      setName('')
      setInstructions('')
      window.location.reload()
    } catch {
      setError('Could not save tutor profile.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[24px] border border-[#DCE7E2] bg-white/82 p-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Custom lab tutor</p>
        <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">Set class guidance</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#5C7069]">
          Add instructions the hidden lab tutor should follow for a class or lesson style.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="Profile name"
        />
        <input
          value={gradeBand}
          onChange={(event) => setGradeBand(event.target.value)}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
          placeholder="Grade band"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as 'teacher_private' | 'classroom')}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
        >
          <option value="teacher_private">Private to me</option>
          <option value="classroom" disabled={classrooms.length === 0}>
            Share with a class
          </option>
        </select>
        <select
          value={classroomId}
          onChange={(event) => setClassroomId(event.target.value)}
          disabled={scope !== 'classroom' || classrooms.length === 0}
          className="rounded-[16px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C] disabled:opacity-60"
        >
          {classrooms.length === 0 ? <option value="">Create a class first</option> : null}
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        rows={6}
        className="w-full resize-y rounded-[18px] border border-[#B8C8C2] bg-[#EEF3F0] px-4 py-3 text-[#14312A] outline-none transition-colors focus:border-[#16423C]"
        placeholder="Example: Use ratio tables first, avoid final answers until the student explains the unit rate, and connect examples to our current shopping-discount unit."
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full border border-[#143C36] bg-[#12352F] px-5 py-2.5 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Save profile'}
        </button>
        <FormAlert message={message} tone="success" />
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
