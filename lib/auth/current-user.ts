import { getAuth } from '@/lib/auth/neon-server'

export type SessionUser = {
  id: string
  email: string | null
  name: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { data } = await getAuth().getSession()
  const user = data?.user
  if (!user?.id) return null

  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
    name: typeof user.name === 'string' ? user.name : null,
  }
}
