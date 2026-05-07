import '@neondatabase/neon-js/ui/css'
import { authViewPaths } from '@neondatabase/auth/react/ui/server'
import { AuthProvider } from '@/app/auth-provider'
import { AuthViewClient } from './auth-view-client'

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }))
}

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params
  return (
    <AuthProvider>
      <AuthViewClient pathname={path} />
    </AuthProvider>
  )
}
