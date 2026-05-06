import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'
import { getSessionUserId } from '@/lib/tutor/session-user'
import { getTutorSessionDetailForUser } from '@/lib/tutor/history'

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

  const { sessionId } = await params
  const session = await getTutorSessionDetailForUser(userId, sessionId)

  if (!session) {
    notFound()
  }

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
            <Link
              href="/tutor"
              className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]"
            >
              Tutor
            </Link>
            <Link
              href="/dashboard"
              className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]"
            >
              Dashboard
            </Link>
            <SignOutButton className="text-xs uppercase tracking-widest text-[#3F524C] transition-colors hover:text-[#16423C]" />
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-6 py-8 md:px-12 md:py-10">
        <section className="rounded-[32px] border border-white/70 bg-[rgba(248,251,249,0.9)] px-6 py-7 shadow-[0_28px_80px_-50px_rgba(15,41,34,0.6)] backdrop-blur-xl md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center text-[11px] uppercase tracking-[0.22em] text-[#5C7069] transition-colors hover:text-[#16423C]"
              >
                Back to all sessions
              </Link>
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-[#5C7069]">Session detail</p>
                <h1 className="mt-2 text-[2.4rem] font-light leading-none tracking-[-0.04em] text-[#0F2922] serif">
                  {session.firstUserMessage?.trim() ? session.firstUserMessage : 'Tutor session'}
                </h1>
                <p className="mt-3 text-[0.98rem] leading-relaxed text-[#4D625C]">
                  Saved transcript, session metadata, and the latest board snapshot from this
                  tutoring session.
                </p>
              </div>
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
                <p>Teacher and parent views can be layered on top of this same structure later without changing the student history model.</p>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}
