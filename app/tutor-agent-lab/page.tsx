'use client'

import { useState } from 'react'
import TutorWorkspace from '@/components/tutor/TutorWorkspace'
import { useVoiceAgentTutor } from '@/hooks/useVoiceAgentTutor'

export default function TutorAgentLabPage() {
  const [error, setError] = useState<string | null>(null)

  const session = useVoiceAgentTutor({
    onError: (userMessage) => setError(userMessage),
  })

  return <TutorWorkspace mode="agent-lab" error={error} setError={setError} session={session} />
}
