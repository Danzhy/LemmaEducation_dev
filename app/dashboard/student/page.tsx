import Link from 'next/link'
import { redirect } from 'next/navigation'
import DashboardScaffold from '@/components/dashboard/DashboardScaffold'
import { JoinClassForm, StudentAccessCodeCard } from '@/components/dashboard/DashboardForms'
import { getCurrentUserProfile, getActiveStudentAccessCode, isOnboardingComplete } from '@/lib/school/profiles'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { listTutorSessionsForUser } from '@/lib/tutor/history'
import { getStudentClassrooms } from '@/lib/school/access'

export const dynamic = 'force-dynamic'

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '0m'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
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
    case 'session_limit':
      return 'Session limit reached'
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

export default async function StudentDashboardPage() {
  const userId = await getSessionUserId()
  if (!userId) redirect('/auth/sign-in')

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) {
    redirect('/dashboard/onboarding')
  }
  if (profile.role !== 'student' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const [{ sessions, summary }, classrooms, accessCode] = await Promise.all([
    listTutorSessionsForUser(userId),
    getStudentClassrooms(userId),
    getActiveStudentAccessCode(userId),
  ])

  const remainingPercent =
    summary.quotaSeconds > 0
      ? Math.max(0, Math.min(100, Math.round((summary.remainingSeconds / summary.quotaSeconds) * 100)))
      : 0

  return (
    <DashboardScaffold
      currentLabel="Student dashboard"
      title="Your math sessions, saved."
      description="Review past tutoring sessions, revisit the transcript, and keep your family or school connections scoped to the work that matters."
      navLink={{ href: '/tutor', label: 'Tutor' }}
      primaryAction={
        <Link
          href="/tutor"
          className="inline-flex items-center justify-center rounded-full border border-[#143C36] bg-[#12352F] px-5 py-3 text-sm text-[#F2F5F4] transition-colors hover:bg-[#16423C]"
        >
          Start tutoring
        </Link>
      }
    >
      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[32px] border border-[#D8E4DF] bg-white/82 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Sessions</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">{summary.totalSessions}</p>
            </div>
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Practice time</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">
                {formatDuration(summary.totalPracticeSeconds)}
              </p>
            </div>
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Time left</p>
                <span className="text-xs text-[#5C7069]">{formatDuration(summary.remainingSeconds)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#DCE7E2]">
                <div className="h-full rounded-full bg-[#16423C]" style={{ width: `${remainingPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Saved sessions</p>
              <h2 className="mt-2 text-[1.55rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                Review your recent work
              </h2>
            </div>

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
                          {session.firstUserMessage?.trim() ? session.firstUserMessage : 'Tutor session'}
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
        </div>

        <div className="space-y-6">
          <JoinClassForm />

          <section className="rounded-[24px] border border-[#DCE7E2] bg-white/82 px-5 py-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">My classrooms</p>
            <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">School connections</h3>
            <div className="mt-4 space-y-3">
              {classrooms.length === 0 ? (
                <p className="text-sm leading-relaxed text-[#5C7069]">
                  You are not in a class yet. Ask your teacher for a class code to connect school oversight.
                </p>
              ) : (
                classrooms.map((classroom) => (
                  <div key={classroom.id} className="rounded-[18px] border border-[#E1EAE6] bg-[#F8FBF9] px-4 py-4">
                    <p className="text-base text-[#14312A]">{classroom.name}</p>
                    <p className="mt-1 text-sm text-[#5C7069]">
                      {classroom.gradeLabel ?? 'Classroom'}{classroom.schoolName ? ` · ${classroom.schoolName}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <StudentAccessCodeCard initialCode={accessCode?.code ?? null} />
        </div>
      </section>
    </DashboardScaffold>
  )
}
