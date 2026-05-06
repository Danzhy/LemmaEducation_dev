'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth/client'

export default function SignOutButton({
  className = '',
  label = 'Sign out',
}: {
  className?: string
  label?: string
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSignOut = async () => {
    try {
      setIsSubmitting(true)
      await authClient.signOut()
      window.location.replace('/auth/sign-in')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={isSubmitting}
      className={className}
    >
      {isSubmitting ? 'Signing out...' : label}
    </button>
  )
}
