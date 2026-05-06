import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/current-user'
import { getCurrentUserProfile, isOnboardingComplete } from '@/lib/school/profiles'

export const dynamic = 'force-dynamic'

export default async function TutorLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/sign-in')
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !isOnboardingComplete(profile)) {
    redirect('/dashboard/onboarding')
  }

  if (profile.role !== 'student' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  return children
}
