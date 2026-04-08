import { getAuth } from '@/lib/auth/neon-server'

export async function getSessionUserId(): Promise<string | null> {
  const { data } = await getAuth().getSession()
  return data?.user?.id ?? null
}
