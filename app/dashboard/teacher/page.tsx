import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardScaffold from '@/components/dashboard/DashboardScaffold'
import { CreateClassForm } from '@/components/dashboard/DashboardForms'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getTeacherDashboardData } from '@/lib/school/access'

export const dynamic = 'force-dynamic'

function formatSessionDate(date: Date | null) {
  if (!date) return 'No sessions yet'
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

export default async function TeacherDashboardPage() {
  const userId = await getSessionUserId()
  if (!userId) redirect('/auth/sign-in')

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) {
    redirect('/dashboard/onboarding')
  }
  if (profile.role !== 'teacher' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const { classrooms, totalStudents, totalSessions } = await getTeacherDashboardData(userId)

  return (
    <DashboardScaffold
      currentLabel="Teacher dashboard"
      title="See classroom activity at a glance."
      description="Create classes, share student join codes, and review tutoring activity without stepping into the student’s workspace."
    >
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[#D8E4DF] bg-white/82 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Classes</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">{classrooms.length}</p>
            </div>
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Students</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">{totalStudents}</p>
            </div>
            <div className="rounded-[22px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7F79]">Saved sessions</p>
              <p className="mt-3 text-2xl font-light text-[#14312A]">{totalSessions}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Classrooms</p>
              <h2 className="mt-2 text-[1.55rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                Create a class and share the join code
              </h2>
            </div>

            {classrooms.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#C9D6D1] bg-[#F8FBF9] px-5 py-8 text-center">
                <p className="text-lg font-light text-[#14312A] serif">No classes yet</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#5C7069]">
                  Start by creating your first class, then share the join code with students.
                </p>
              </div>
            ) : (
              classrooms.map((classroom) => (
                <div key={classroom.id} className="rounded-[26px] border border-[#DCE7E2] bg-[#F9FBFA] px-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-[1.2rem] font-light text-[#0F2922]">{classroom.name}</h3>
                      <p className="mt-2 text-sm text-[#5C7069]">
                        {classroom.gradeLabel ?? 'Classroom'}
                        {classroom.schoolName ? ` · ${classroom.schoolName}` : ''}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-[#D5E1DD] bg-white/82 px-4 py-3 text-sm text-[#16423C]">
                      Join code: <span className="font-medium tracking-[0.12em]">{classroom.joinCode}</span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {classroom.students.length === 0 ? (
                      <p className="text-sm leading-relaxed text-[#5C7069]">
                        No students have joined this class yet.
                      </p>
                    ) : (
                      classroom.students.map((student) => (
                        <div key={student.userId} className="rounded-[18px] border border-[#E1EAE6] bg-white/82 px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base text-[#14312A]">{student.displayName}</p>
                              <p className="mt-1 text-sm text-[#5C7069]">
                                {student.gradeLevel ?? 'Student'} · {student.sessionCount} saved session{student.sessionCount === 1 ? '' : 's'}
                              </p>
                            </div>
                            <p className="text-sm text-[#5C7069]">Last activity: {formatSessionDate(student.lastSessionAt)}</p>
                          </div>
                          {student.recentSessions.length > 0 ? (
                            <div className="mt-4 space-y-2">
                              {student.recentSessions.map((session) => (
                                <Link
                                  key={session.id}
                                  href={`/dashboard/${session.id}`}
                                  className="block rounded-[16px] border border-[#E7EFEB] bg-[#F8FBF9] px-3 py-3 text-sm text-[#14312A] transition-colors hover:border-[#B8C8C2]"
                                >
                                  <p>{session.firstUserMessage ?? 'Tutor session'}</p>
                                  <p className="mt-1 text-xs text-[#5C7069]">
                                    {formatSessionDate(session.startedAt)} · {formatDuration(session.activeSeconds)}
                                  </p>
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <CreateClassForm />
          <section className="rounded-[24px] border border-[#DCE7E2] bg-white/82 px-5 py-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Privacy and access</p>
            <h3 className="mt-2 text-[1.15rem] font-light text-[#0F2922]">Read-only oversight</h3>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#5C7069]">
              <p>Teacher access is limited to students who have joined your classes.</p>
              <p>Session review is read-only. Students still own the live tutoring workspace.</p>
              <p>Role-based access keeps parent and teacher visibility scoped to the right learners.</p>
            </div>
          </section>
        </div>
      </section>
    </DashboardScaffold>
  )
}
