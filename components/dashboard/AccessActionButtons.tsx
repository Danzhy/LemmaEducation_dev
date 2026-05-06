'use client'

import { useState } from 'react'

function ActionMessage({
  message,
  tone,
}: {
  message: string | null
  tone: 'success' | 'error'
}) {
  if (!message) return null

  return (
    <p className={`text-xs ${tone === 'success' ? 'text-[#16423C]' : 'text-red-700'}`}>{message}</p>
  )
}

export function RemoveStudentButton({
  classroomId,
  studentUserId,
}: {
  classroomId: string
  studentUserId: string
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async () => {
    const confirmed = window.confirm(
      'Remove this student from the class? They will keep their saved sessions, but this class will no longer have access.'
    )
    if (!confirmed) return

    setError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/students/${studentUserId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not remove student.')
        return
      }
      window.location.reload()
    } catch {
      setError('Could not remove student.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleRemove()}
        disabled={isSubmitting}
        className="rounded-full border border-[#D8B8B1] bg-[#FCF2F0] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#8B3A2E] transition-colors hover:bg-[#F7E5E1] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Removing...' : 'Remove'}
      </button>
      <ActionMessage message={error} tone="error" />
    </div>
  )
}

export function UnlinkGuardianButton({
  studentUserId,
  guardianUserId,
  mode,
}: {
  studentUserId: string
  guardianUserId?: string
  mode: 'student' | 'parent'
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnlink = async () => {
    const confirmed = window.confirm(
      mode === 'student'
        ? 'Remove this parent from your saved-session access?'
        : 'Unlink this student from your parent dashboard?'
    )
    if (!confirmed) return

    setError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/guardian-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentUserId,
          guardianUserId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message || 'Could not update guardian access.')
        return
      }
      window.location.reload()
    } catch {
      setError('Could not update guardian access.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleUnlink()}
        disabled={isSubmitting}
        className="rounded-full border border-[#D8B8B1] bg-[#FCF2F0] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#8B3A2E] transition-colors hover:bg-[#F7E5E1] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Updating...' : mode === 'student' ? 'Revoke access' : 'Unlink'}
      </button>
      <ActionMessage message={error} tone="error" />
    </div>
  )
}
