import { neon } from '@neondatabase/serverless'

export function getNeonSql(options?: { signal?: AbortSignal }) {
  const url = process.env.NEON_DATABASE_URL
  if (!url?.trim()) {
    throw new Error('NEON_DATABASE_URL is not configured')
  }
  return neon(
    url,
    options?.signal
      ? {
          fetchOptions: {
            signal: options.signal,
          },
        }
      : undefined
  )
}
