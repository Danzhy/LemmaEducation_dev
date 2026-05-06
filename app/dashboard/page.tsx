import { redirect } from 'next/navigation'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'
import { getSessionUserId } from '@/lib/tutor/session-user'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const userId = await getSessionUserId()
  if (!userId) {
    redirect('/auth/sign-in')
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) {
    redirect('/dashboard/onboarding')
  }

  switch (profile.role) {
    case 'teacher':
      redirect('/dashboard/teacher')
    case 'parent':
      redirect('/dashboard/parent')
    case 'admin':
      redirect('/dashboard/teacher')
    case 'student':
    default:
      redirect('/dashboard/student')
  }
}
