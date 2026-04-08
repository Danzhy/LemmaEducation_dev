'use client'

import { AuthView } from '@neondatabase/auth/react/ui'
import Link from 'next/link'
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'

export function AuthViewClient({ pathname }: { pathname: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-[#F2F5F4]">
      <div className="w-full max-w-sm flex justify-center mb-6">
        <Link
          href="/"
          className="text-xs uppercase tracking-widest text-[#3F524C] hover:text-[#16423C] transition-colors"
        >
          ← Home
        </Link>
      </div>
      <AuthView
        pathname={pathname}
        localization={{
          SIGN_UP_DESCRIPTION: `Enter your information to create an account. Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
        }}
      />
    </div>
  )
}
