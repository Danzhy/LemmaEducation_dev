import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/app/auth-provider'

export const metadata: Metadata = {
  title: 'Lemma Education | AI Math Tutor That Listens',
  description:
    'Lemma is a voice AI math tutor that watches students solve, listens to their reasoning, and gives real-time feedback while they work.',
  openGraph: {
    title: 'Lemma Education | The AI Math Tutor That Listens',
    description:
      'A voice-aware AI math tutor with a shared canvas, built to help students reason through problems instead of just getting answers.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
