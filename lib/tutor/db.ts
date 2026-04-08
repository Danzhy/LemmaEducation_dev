import { neon } from '@neondatabase/serverless'

export function getNeonSql() {
  const url = process.env.NEON_DATABASE_URL
  if (!url?.trim()) {
    throw new Error('NEON_DATABASE_URL is not configured')
  }
  return neon(url)
}
