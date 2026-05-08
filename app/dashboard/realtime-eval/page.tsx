import Link from 'next/link'
import { redirect } from 'next/navigation'
import DashboardScaffold from '@/components/dashboard/DashboardScaffold'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { getSessionUserId } from '@/lib/tutor/session-user'
import {
  REALTIME_MODEL_PRICING,
  REALTIME_USAGE_PROFILES,
  estimateRealtimeModelCost,
  formatUsd,
  resolveTutorStrategies,
  scoreLabel,
  type RealtimeModelId,
} from '@/lib/tutor/realtime-strategy-catalog'

export const dynamic = 'force-dynamic'

const MODEL_ORDER: RealtimeModelId[] = [
  'gpt-realtime-mini',
  'gpt-realtime-1.5',
  'gpt-realtime-2',
  'gpt-realtime',
]

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-[#CBD9D4] bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#50645E]">
      {label}
    </span>
  )
}

function ScoreCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-[18px] border border-[#DCE7E2] bg-[#F8FBF9] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[#14312A]">{scoreLabel(score)}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#DDE7E3]">
        <div className="h-full rounded-full bg-[#16423C]" style={{ width: `${score * 20}%` }} />
      </div>
    </div>
  )
}

export default async function RealtimeEvalDashboardPage() {
  const userId = await getSessionUserId()
  if (!userId) redirect('/auth/sign-in')

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) redirect('/dashboard/onboarding')

  const strategies = resolveTutorStrategies()
  const recommended = strategies.find((strategy) => strategy.id === 'livekit-worker-realtime')

  return (
    <DashboardScaffold
      currentLabel="Realtime evaluation"
      title="Compare tutor voice stacks before changing the student experience."
      description="Internal lab view for model choice, cost shape, tool ownership, and pilot-readiness tradeoffs."
    >
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[#D8E4DF] bg-white/84 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Current recommendation</p>
              <h2 className="mt-2 text-[1.65rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
                Pilot the LiveKit worker path, keep direct Realtime as fallback.
              </h2>
            </div>
            <StatusPill label="dev only" />
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#536760]">
            LiveKit gives us the cleanest route to server-owned math tools, audit trails, room-level control, and
            deployment isolation. The Agents SDK page stays useful for fast model and prompt iteration.
          </p>

          {recommended ? (
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <ScoreCell label="Latency" score={recommended.latencyScore} />
              <ScoreCell label="Cost" score={recommended.costScore} />
              <ScoreCell label="Safety" score={recommended.safetyScore} />
              <ScoreCell label="Build fit" score={recommended.implementationScore} />
            </div>
          ) : null}
        </div>

        <div className="rounded-[32px] border border-[#D8E4DF] bg-[#F8FBF9] px-6 py-6 md:px-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Model answer</p>
          <h2 className="mt-2 text-[1.45rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
            What models are these labs using?
          </h2>
          <div className="mt-5 space-y-3 text-sm leading-relaxed text-[#536760]">
            {strategies.slice(0, 3).map((strategy) => (
              <div key={strategy.id} className="border-t border-[#D7E2DE] pt-3">
                <p className="font-medium text-[#14312A]">{strategy.label}</p>
                <p>
                  {strategy.currentModel}
                  {strategy.modelEnv ? <span className="text-[#78908A]"> via {strategy.modelEnv}</span> : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-[#D8E4DF] bg-white/84 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Strategy matrix</p>
            <h2 className="mt-2 text-[1.6rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
              Separate pages, one shared tutor shell.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[#5C7069]">
            The pages below should remain hidden from public nav while we compare behavior and cost.
          </p>
        </div>

        <div className="mt-6 divide-y divide-[#D7E2DE]">
          {strategies.map((strategy) => (
            <article key={strategy.id} className="grid gap-5 py-5 lg:grid-cols-[0.9fr_1.15fr_0.95fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-medium text-[#14312A]">{strategy.label}</h3>
                  <StatusPill label={strategy.productionReadiness} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#536760]">{strategy.stack}</p>
                <Link href={strategy.dashboardRoute ?? strategy.route} className="mt-3 inline-flex text-sm font-medium text-[#16423C] hover:text-[#0A2621]">
                  Open route
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">Transport</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#203A34]">{strategy.transport}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">Tools</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#203A34]">{strategy.toolExecution}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">Strength</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#203A34]">{strategy.strengths[0]}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">Main risk</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#203A34]">{strategy.risks[0]}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#DCE7E2] bg-[#F8FBF9] px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B7F79]">Recommendation</p>
                <p className="mt-2 text-sm leading-relaxed text-[#203A34]">{strategy.recommendation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-[#D8E4DF] bg-[#F8FBF9] px-6 py-6 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Cost proxy</p>
            <h2 className="mt-2 text-[1.6rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
              Model cost shape by session type.
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-relaxed text-[#5C7069]">
            These are planning estimates from token profiles, not invoices. Real cost must be measured from API usage logs.
          </p>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#CBD9D4] text-[11px] uppercase tracking-[0.18em] text-[#6B7F79]">
                <th className="pb-3 pr-4 font-medium">Profile</th>
                {MODEL_ORDER.map((modelId) => (
                  <th key={modelId} className="pb-3 pr-4 font-medium">
                    {REALTIME_MODEL_PRICING[modelId].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D7E2DE]">
              {REALTIME_USAGE_PROFILES.map((profile) => (
                <tr key={profile.id}>
                  <td className="py-4 pr-4">
                    <p className="font-medium text-[#14312A]">{profile.label}</p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#6B7F79]">{profile.description}</p>
                  </td>
                  {MODEL_ORDER.map((modelId) => (
                    <td key={modelId} className="py-4 pr-4 text-[#203A34]">
                      {formatUsd(estimateRealtimeModelCost(modelId, profile).total)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[32px] border border-[#D8E4DF] bg-white/84 px-6 py-6 md:px-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Next tests</p>
          <h2 className="mt-2 text-[1.45rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
            What to run before a pilot.
          </h2>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[#536760]">
            <li>Run the same 12 grade 3-7 tasks across direct Realtime, Agents SDK, and LiveKit worker.</li>
            <li>Compare gpt-realtime-mini, gpt-realtime-1.5, and gpt-realtime-2 for tool reliability and interruption recovery.</li>
            <li>Measure time to first audio, tool completion time, graph render success, and number of unsupported answers.</li>
            <li>Use typed tool preview first so board tools are deterministic before spending realtime audio tokens.</li>
          </ul>
        </div>

        <div className="rounded-[32px] border border-[#D8E4DF] bg-white/84 px-6 py-6 md:px-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#5C7069]">Docs basis</p>
          <h2 className="mt-2 text-[1.45rem] font-light tracking-[-0.03em] text-[#0F2922] serif">
            Current docs signals.
          </h2>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[#536760]">
            <li>OpenAI lists gpt-realtime-2 as the stronger realtime voice model for complex tool-using agents.</li>
            <li>OpenAI lists gpt-realtime-mini as the cost-efficient realtime option.</li>
            <li>LiveKit Agents supports server-side realtime participants, tools, and frontend RPC/data exchange.</li>
            <li>LiveKit Cloud has participant-minute quotas and possible agent cold starts, so join latency needs real measurement.</li>
          </ul>
        </div>
      </section>
    </DashboardScaffold>
  )
}
