'use client'

import { useState } from 'react'
import TutorWorkspace from '@/components/tutor/TutorWorkspace'
import { useRealtimeTutor } from '@/hooks/useRealtimeTutor'

export default function TutorPage() {
  const [error, setError] = useState<string | null>(null)

  const session = useRealtimeTutor({
    onError: (userMessage) => setError(userMessage),
  })

  return <TutorWorkspace mode="stable" error={error} setError={setError} session={session} />
}
