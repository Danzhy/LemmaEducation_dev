import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

export default function TutorLayout({
  children,
}: {
  children: ReactNode
}) {
  redirect('/#waitlist')
}
