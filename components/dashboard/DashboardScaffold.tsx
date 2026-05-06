import Link from 'next/link'
import type { ReactNode } from 'react'
import SignOutButton from '@/components/SignOutButton'

export default function DashboardScaffold({
  currentLabel,
  title,
  description,
  children,
  primaryAction,
  navLink,
}: {
  currentLabel: string
  title: string
  description: string
  children: ReactNode
  primaryAction?: ReactNode
  navLink?: {
    href: string
    label: string
  }
}) {
  return (
    <div className="min-h-screen bg-[#F2F5F4]">
      <nav className="w-full border-b border-[#D1DBD7] px-6 py-6 md:px-12">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4">
          <Link
            href="/"
            className="text-2xl tracking-tight font-medium serif italic text-[#16423C] hover:text-[#0A2621]"
          >
            Lemma.
          </Link>
          <div className="flex items-center gap-4">
            {navLink ? (
              <Link
                href={navLink.href}
                className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]"
              >
                {navLink.label}
              </Link>
            ) : null}
            <span className="text-xs uppercase tracking-widest text-[#16423C]">{currentLabel}</span>
            <SignOutButton className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]" />
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-6 py-8 md:px-12 md:py-10">
        <section className="rounded-[32px] border border-white/70 bg-[rgba(248,251,249,0.9)] px-6 py-7 shadow-[0_28px_80px_-50px_rgba(15,41,34,0.6)] backdrop-blur-xl md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#5C7069]">
                {currentLabel}
              </p>
              <div>
                <h1 className="text-[2.45rem] font-light leading-none tracking-[-0.04em] text-[#0F2922] serif">
                  {title}
                </h1>
                <p className="mt-3 max-w-[48rem] text-[0.98rem] leading-relaxed text-[#4D625C]">
                  {description}
                </p>
              </div>
            </div>
            {primaryAction ? <div className="flex-shrink-0">{primaryAction}</div> : null}
          </div>
        </section>

        {children}
      </main>
    </div>
  )
}
