'use client'

import { AuthView } from '@neondatabase/auth/react/ui'
import Link from 'next/link'
import CanvasBackground from '@/components/CanvasBackground'
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'
import { AuthEmailForm } from './auth-email-form'

function getAuthCopy(pathname: string) {
  if (pathname.includes('sign-up')) {
    return {
      mode: 'sign-up' as const,
      eyebrow: 'Early access',
      title: 'Create your Lemma account.',
      panelLabel: 'Create account',
      panelNote: `Passwords must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
      showSupportDetails: false,
    }
  }

  if (pathname.includes('forgot-password') || pathname.includes('reset-password')) {
    return {
      mode: 'recovery' as const,
      eyebrow: 'Account recovery',
      title: 'Get back into Lemma.',
      description:
        'Reset your password and return to the same voice-first math workspace without losing access to your account.',
      panelLabel: 'Reset access',
      panelNote: null,
      showSupportDetails: false,
    }
  }

  return {
    mode: 'sign-in' as const,
    eyebrow: 'Early access',
    title: 'Sign in to continue.',
    panelLabel: 'Sign in',
    panelNote: null,
    showSupportDetails: false,
  }
}

export function AuthViewClient({ pathname }: { pathname: string }) {
  const copy = getAuthCopy(pathname)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F2F5F4]">
      <CanvasBackground />

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-8 md:px-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-2xl tracking-tight font-medium serif italic text-[#16423C] transition-colors hover:text-[#0A2621]"
          >
            Lemma.
          </Link>
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.22em] text-[#5C7069] transition-colors hover:text-[#16423C]"
          >
            Back home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-1 items-center py-10 md:py-14">
          <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <section className="flex flex-col justify-center">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#5C7069] md:text-xs">
                {copy.eyebrow}
              </p>
              <h1 className="mt-5 max-w-xl text-5xl font-light leading-[0.98] text-[#0F2922] serif md:text-7xl">
                {copy.title}
              </h1>
              {copy.description ? (
                <p className="mt-6 max-w-lg text-base font-light leading-7 text-[#3F524C] md:text-lg">
                  {copy.description}
                </p>
              ) : null}

              {copy.showSupportDetails ? (
                <div className="mt-10 max-w-xl border-t border-[#D7E0DC]">
                  {[
                    {
                      label: 'Voice-aware tutoring',
                      text: 'Students talk through what they are trying while Lemma follows along.',
                    },
                    {
                      label: 'Shared math canvas',
                      text: 'Write, draw, upload a problem, and solve in one place instead of switching tools.',
                    },
                    {
                      label: 'Real-time guidance',
                      text: 'Hints and questions appear during the process, not only after the final answer.',
                    },
                  ].map((item) => (
                    <div key={item.label} className="border-b border-[#D7E0DC] py-5">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#6A7E78] md:text-[11px]">
                        {item.label}
                      </p>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-[#314640] md:text-[15px]">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="flex items-center justify-center">
              <div className="lemma-auth-shell w-full max-w-[28rem] rounded-[30px] border border-white/70 bg-[rgba(248,251,249,0.88)] p-5 shadow-[0_28px_80px_-50px_rgba(15,41,34,0.7)] backdrop-blur-xl md:p-7">
                <div className="border-b border-[#DCE7E2] pb-5">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#5C7069] md:text-[11px]">
                    {copy.panelLabel}
                  </p>
                  {copy.panelNote ? (
                    <p className="mt-2 text-sm leading-6 text-[#5C7069]">{copy.panelNote}</p>
                  ) : null}
                </div>

                <div className="pt-5">
                  {copy.mode === 'recovery' ? <AuthView pathname={pathname} /> : <AuthEmailForm mode={copy.mode} />}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
