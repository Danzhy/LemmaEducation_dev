'use client'

import { useState } from 'react'
import TutorWorkspace from '@/components/tutor/TutorWorkspace'
import { useLiveKitTutor } from '@/hooks/useLiveKitTutor'

export default function TutorLiveKitLabPage() {
  const [error, setError] = useState<string | null>(null)

  const session = useLiveKitTutor({
    onError: (userMessage) => setError(userMessage),
  })

  return <TutorWorkspace mode="livekit-lab" error={error} setError={setError} session={session} />
}
