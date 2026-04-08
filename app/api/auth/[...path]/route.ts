import { getAuth } from '@/lib/auth/neon-server'

export const { GET, POST, PUT, PATCH, DELETE } = getAuth().handler()
