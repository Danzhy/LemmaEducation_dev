import { redirect } from 'next/navigation'
import DashboardScaffold from '@/components/dashboard/DashboardScaffold'
import { OnboardingForm } from '@/components/dashboard/DashboardForms'
import { getSessionUser } from '@/lib/auth/current-user'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'

export const dynamic = 'force-dynamic'

export default async function DashboardOnboardingPage() {
  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/sign-in')
  }

  const profile = await getCurrentUserProfile()
  if (profile && isOnboardingComplete(profile)) {
    redirect('/dashboard')
  }

  return (
    <DashboardScaffold
      currentLabel="Onboarding"
      title="Set up your Lemma role."
      description="Choose how you’ll use Lemma, confirm the pilot privacy notice, and connect to a classroom or student when needed."
    >
      <section className="rounded-[32px] border border-[#D8E4DF] bg-white/82 px-6 py-6 shadow-[0_22px_60px_-46px_rgba(15,41,34,0.45)] md:px-8">
        <OnboardingForm initialName={user.name ?? ''} initialEmail={user.email} />
      </section>
    </DashboardScaffold>
  )
}
