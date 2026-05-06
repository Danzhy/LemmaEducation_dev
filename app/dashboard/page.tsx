import Link from 'next/link'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { listTutorSessionsForUser } from '@/lib/tutor/history'

export const dynamic = 'force-dynamic'

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '0m'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m`
  }

  return `${seconds}s`
}

function formatSessionDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatEndedReason(reason: string | null) {
  switch (reason) {
    case 'user':
      return 'Completed'
    case 'quota':
      return 'Time limit reached'
    case 'error':
      return 'Ended early'
    default:
      return 'Saved'
  }
}

function formatLanguageLabel(language: string) {
  if (language.toLowerCase() === 'en') return 'English'
  return language.toUpperCase()
}

function formatPercent(remainingSeconds: number, quotaSeconds: number) {
  if (quotaSeconds <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((remainingSeconds / quotaSeconds) * 100)))
}

export default async function DashboardPage() {
  const userId = await getSessionUserId()
  if (!userId) {
    redirect('/auth/sign-in')
  }

  const { sessions, summary } = await listTutorSessionsForUser(userId)
  const remainingPercent = formatPercent(summary.remainingSeconds, summary.quotaSeconds)

  return (
    <div className="min-h-screen bg-[#F2F5F4]">
      <nav className="w-full border-b border-[#D1DBD7] px-6 py-6 md:px-12">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4">
          <Link
            href="/"
            className="text-2xl tracking-tight font-medium serif italic text-[#16423C] hover:text-[#0A2621]"
          >
            Lemma.
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/tutor"
              className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]"
            >
              Tutor
            </Link>
            <span className="text-xs uppercase tracking-widest text-[#16423C]">Dashboard</span>
            <SignOutButton className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]" />
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 py-8 md:px-12 md:py-10">
        <section className="rounded-[32px] border border-white/70 bg-[rgba(248,251,249,0.9)] px-6 py-7 shadow-[0_28px_80px_-50px_rgba(15,41,34,0.6)] backdrop-blur-xl md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#5C7069]">
                Session history
              </p>
              <div>
                <h1 className="text-[2.6rem] font-light leading-none tracking-[-0.04em] text-[#0F2922] serif">
                  Your math sessions, saved.
                </h1>
                <p className="mt-3 max-w-[46rem] text-[0.98rem] leading-relaxed text-[#4D625C]">
                  Review past tutoring sessions, revisit the transcript, and pick up where you
                  left off.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[31rem]">
              <div className="rounded-[22px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Sessions</p>
                <p className="mt-3 text-2xl font-light text-[#14312A]">{summary.totalSessions}</p>
              </div>
              <div className="rounded-[22px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Practice time</p>
                <p className="mt-3 text-2xl font-light text-[#14312A]">
                  {formatDuration(summary.totalPracticeSeconds)}
                </p>
              </div>
              <div className="rounded-[22px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Time left</p>
                  <span className="text-xs text-[#5C7069]">
                    {formatDuration(summary.remainingSeconds)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#DCE7E2]">
                  <div
                    className="h-full rounded-full bg-[#16423C] transition-all"
                    style={{ width: `${remainingPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#D8E4DF] bg-white/82 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Saved sessions</p>
              <h2 className="mt-2 text-[1.55rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                Review your recent work
              </h2>
            </div>
            <Link
              href="/tutor"
              className="inline-flex items-center justify-center rounded-full border border-[#B8C8C2] bg-[#ECF1EE] px-4 py-2 text-sm text-[#16423C] transition-colors hover:border-[#16423C] hover:bg-white"
            >
              Start a new session
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {sessions.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#C9D6D1] bg-[#F8FBF9] px-5 py-8 text-center">
                <p className="text-lg font-light text-[#14312A] serif">No sessions yet</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#5C7069]">
                  Your tutoring history will appear here after you complete a session.
                </p>
              </div>
            ) : (
              sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/dashboard/${session.id}`}
                  className="group block rounded-[26px] border border-[#DCE7E2] bg-[#F9FBFA] px-5 py-5 transition-all hover:-translate-y-0.5 hover:border-[#B8C8C2] hover:bg-white hover:shadow-[0_18px_46px_-34px_rgba(15,41,34,0.35)]"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">
                        <span>{formatSessionDate(session.startedAt)}</span>
                        {session.gradeLevel ? <span>{session.gradeLevel}</span> : null}
                        <span>{formatLanguageLabel(session.language)}</span>
                      </div>
                      <div>
                        <h3 className="text-[1.2rem] font-light leading-tight text-[#0F2922] group-hover:text-[#16423C]">
                          {session.firstUserMessage?.trim()
                            ? session.firstUserMessage
                            : 'Tutor session'}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-[#5C7069]">
                          {session.userMessageCount} student turns, {session.assistantMessageCount} tutor turns
                          {session.hasCanvasSnapshot ? ', board snapshot saved.' : '.'}
                        </p>
                      </div>
                    </div>

                    <div className="grid flex-shrink-0 gap-3 sm:grid-cols-2 lg:min-w-[18rem]">
                      <div className="rounded-[18px] border border-[#E1EAE6] bg-white/82 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#6B7F79]">Duration</p>
                        <p className="mt-2 text-base text-[#14312A]">{formatDuration(session.activeSeconds)}</p>
                      </div>
                      <div className="rounded-[18px] border border-[#E1EAE6] bg-white/82 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#6B7F79]">Status</p>
                        <p className="mt-2 text-base text-[#14312A]">{formatEndedReason(session.endedReason)}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
