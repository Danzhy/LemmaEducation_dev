import Link from 'next/link'
import { redirect } from 'next/navigation'
import DashboardScaffold from '@/components/dashboard/DashboardScaffold'
import { LinkStudentForm } from '@/components/dashboard/DashboardForms'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getParentDashboardData } from '@/lib/school/access'

export const dynamic = 'force-dynamic'

function formatSessionDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '0m'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

export default async function ParentDashboardPage() {
  const userId = await getSessionUserId()
  if (!userId) redirect('/auth/sign-in')

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) {
    redirect('/dashboard/onboarding')
  }
  if (profile.role !== 'parent' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const { students, totalSessions } = await getParentDashboardData(userId)

  return (
    <DashboardScaffold
      currentLabel="Parent dashboard"
      title="Follow student progress without stepping into the live session."
      description="Connect to a student with a parent access code, then review their saved sessions, transcripts, and board snapshots in a read-only space."
    >
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[32px] border border-[#D8E4DF] bg-white/82 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Linked students</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">{students.length}</p>
            </div>
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Saved sessions</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">{totalSessions}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Linked learners</p>
              <h2 className="mt-2 text-[1.55rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                Review recent student activity
              </h2>
            </div>

            {students.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#C9D6D1] bg-[#F8FBF9] px-5 py-8 text-center">
                <p className="text-lg font-light text-[#14312A] serif">No students linked yet</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#5C7069]">
                  Ask the student for a parent access code, then connect them from the form on the right.
                </p>
              </div>
            ) : (
              students.map((student) => (
                <div key={student.userId} className="rounded-[26px] border border-[#DCE7E2] bg-[#F9FBFA] px-5 py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-[1.2rem] font-light text-[#0F2922]">{student.displayName}</h3>
                      <p className="mt-2 text-sm text-[#5C7069]">
                        {student.gradeLevel ?? 'Student'} · {student.sessionCount} saved session{student.sessionCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <p className="text-sm text-[#5C7069]">
                      Last activity: {student.lastSessionAt ? formatSessionDate(student.lastSessionAt) : 'No sessions yet'}
                    </p>
                  </div>

                  <div className="mt-5 space-y-3">
                    {student.recentSessions.length === 0 ? (
                      <p className="text-sm leading-relaxed text-[#5C7069]">No saved sessions yet.</p>
                    ) : (
                      student.recentSessions.map((session) => (
                        <Link
                          key={session.id}
                          href={`/dashboard/${session.id}`}
                          className="block rounded-[18px] border border-[#E1EAE6] bg-white/82 px-4 py-4 transition-colors hover:border-[#B8C8C2]"
                        >
                          <p className="text-base text-[#14312A]">
                            {session.firstUserMessage ?? 'Tutor session'}
                          </p>
                          <p className="mt-2 text-sm text-[#5C7069]">
                            {formatSessionDate(session.startedAt)} · {formatDuration(session.activeSeconds)}
                          </p>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <LinkStudentForm />
          <section className="rounded-[24px] border border-[#DCE7E2] bg-white/82 px-5 py-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Privacy and access</p>
            <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">Read-only by design</h3>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#5C7069]">
              <p>Parent access only works when a student shares a specific access code.</p>
              <p>Parents can review saved sessions and board snapshots, but they cannot edit live tutoring work.</p>
              <p>This keeps student ownership intact while still giving families useful visibility.</p>
            </div>
          </section>
        </div>
      </section>
    </DashboardScaffold>
  )
}
