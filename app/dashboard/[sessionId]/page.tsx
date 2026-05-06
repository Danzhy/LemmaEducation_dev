import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import DashboardScaffold from '@/components/dashboard/DashboardScaffold'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getAccessibleTutorSessionDetail, getTutorSessionOwnerUserId } from '@/lib/tutor/history'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { recordSessionAccessAudit } from '@/lib/school/access'

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

function formatMessageTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatLanguageLabel(language: string) {
  if (language.toLowerCase() === 'en') return 'English'
  return language.toUpperCase()
}

function formatMessageSource(source: string | null) {
  if (!source || source === 'assistant') return null

  switch (source) {
    case 'text':
      return 'typed'
    case 'text_with_image':
      return 'typed + upload'
    case 'image_only':
      return 'upload'
    case 'speech':
      return 'spoken'
    default:
      return source.replace(/_/g, ' ')
  }
}

export default async function DashboardSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const userId = await getSessionUserId()
  if (!userId) {
    redirect('/auth/sign-in')
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) {
    redirect('/dashboard/onboarding')
  }

  const { sessionId } = await params
  const ownerUserId = await getTutorSessionOwnerUserId(sessionId)
  const session = await getAccessibleTutorSessionDetail(userId, sessionId)

  if (!session || !ownerUserId) {
    notFound()
  }

  if (
    ownerUserId !== userId &&
    (profile.role === 'teacher' || profile.role === 'parent' || profile.role === 'admin')
  ) {
    await recordSessionAccessAudit({
      sessionId,
      studentUserId: ownerUserId,
      viewerUserId: userId,
      viewerRole: profile.role,
    })
  }

  return (
    <DashboardScaffold
      currentLabel="Session detail"
      title={session.firstUserMessage?.trim() ? session.firstUserMessage : 'Tutor session'}
      description="Saved transcript, session metadata, and the latest board snapshot from this tutoring session."
      navLink={{ href: '/dashboard', label: 'Dashboard' }}
    >
        <section className="rounded-[32px] border border-white/70 bg-[rgba(248,251,249,0.9)] px-6 py-7 shadow-[0_28px_80px_-50px_rgba(15,41,34,0.6)] backdrop-blur-xl md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center text-[11px] uppercase tracking-[0.22em] text-[#5C7069] transition-colors hover:text-[#16423C]"
              >
                Back to all sessions
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[36rem]">
              <div className="rounded-[20px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#6B7F79]">Date</p>
                <p className="mt-2 text-sm leading-relaxed text-[#14312A]">
                  {formatSessionDate(session.startedAt)}
                </p>
              </div>
              <div className="rounded-[20px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#6B7F79]">Duration</p>
                <p className="mt-2 text-sm text-[#14312A]">{formatDuration(session.activeSeconds)}</p>
              </div>
              <div className="rounded-[20px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#6B7F79]">Level</p>
                <p className="mt-2 text-sm text-[#14312A]">{session.gradeLevel ?? 'Not set'}</p>
              </div>
              <div className="rounded-[20px] border border-[#DCE7E2] bg-white/82 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#6B7F79]">Language</p>
                <p className="mt-2 text-sm text-[#14312A]">{formatLanguageLabel(session.language)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[30px] border border-[#D8E4DF] bg-white/84 px-5 py-5 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-6">
            <div className="flex items-end justify-between gap-4 border-b border-[#E2EBE7] pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Transcript</p>
                <h2 className="mt-2 text-[1.45rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                  Session conversation
                </h2>
              </div>
              <p className="text-sm text-[#5C7069]">
                {session.messages.length} saved message{session.messages.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {session.messages.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#D5E1DD] bg-[#F8FBF9] px-4 py-6 text-center text-sm text-[#5C7069]">
                  No transcript saved for this session.
                </div>
              ) : (
                session.messages.map((message) => {
                  const sourceLabel = formatMessageSource(message.source)

                  return (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === 'assistant' ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      <div
                        className={`max-w-[42rem] rounded-[24px] px-4 py-3 shadow-[0_14px_34px_-28px_rgba(15,41,34,0.35)] ${
                          message.role === 'assistant'
                            ? 'border border-[#DCE7E2] bg-[#FCFDFC] text-[#14312A]'
                            : 'border border-[#D8E4DF] bg-[#E8F0EC] text-[#14312A]'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">
                          <span>{message.role === 'assistant' ? 'Tutor' : 'Student'}</span>
                          {sourceLabel ? <span>{sourceLabel}</span> : null}
                          <span>{formatMessageTime(message.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[30px] border border-[#D8E4DF] bg-white/84 px-5 py-5 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-6">
              <div className="border-b border-[#E2EBE7] pb-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Board snapshot</p>
                <h2 className="mt-2 text-[1.45rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                  Final saved canvas
                </h2>
              </div>

              <div className="mt-5">
                {session.canvasSnapshot ? (
                  <div className="overflow-hidden rounded-[24px] border border-[#DCE7E2] bg-[#F7FAF8]">
                    <img
                      src={`data:${session.canvasSnapshot.mimeType};base64,${session.canvasSnapshot.dataBase64}`}
                      alt="Saved session board snapshot"
                      className="h-auto w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-[#D5E1DD] bg-[#F8FBF9] px-4 py-8 text-center text-sm leading-relaxed text-[#5C7069]">
                    No board snapshot was saved for this session.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[30px] border border-[#D8E4DF] bg-white/84 px-5 py-5 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-6">
              <div className="border-b border-[#E2EBE7] pb-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">Session notes</p>
                <h2 className="mt-2 text-[1.45rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                  What was saved
                </h2>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-relaxed text-[#4D625C]">
                <p>This session stores the transcript, practice time, math level, language, and the latest saved board image.</p>
                <p>Authorized teachers and parents can review the same saved record without changing the student workspace itself.</p>
                {ownerUserId !== userId ? (
                  <p>Review access is logged so students can see when saved work is opened by a teacher or parent.</p>
                ) : null}
              </div>
            </section>
          </div>
        </section>
    </DashboardScaffold>
  )
}
