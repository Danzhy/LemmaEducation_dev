import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function DashboardTutorAgentLabRedirectPage() {
  redirect('/tutor-agent-lab')
}
