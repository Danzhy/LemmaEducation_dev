import type { Metadata } from 'next'
import '@neondatabase/neon-js/ui/css'
import './globals.css'
import { AuthProvider } from '@/app/auth-provider'

export const metadata: Metadata = {
  title: 'Lemma Education | AI That Listens',
  description: 'Practice Smarter, Learn Deeper',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
