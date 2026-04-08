'use client'

import { NeonAuthUIProvider } from '@neondatabase/auth/react/ui'
import { authClient } from '@/lib/auth/client'
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  // `as any`: Neon Auth UI types can disagree with `authClient` when nested `@better-fetch` versions differ.
  return (
    <NeonAuthUIProvider
      authClient={authClient as any}
      className="min-h-screen"
      credentials={{
        passwordValidation: { minLength: AUTH_PASSWORD_MIN_LENGTH },
      }}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link as any}
    >
      {children}
    </NeonAuthUIProvider>
  )
}
