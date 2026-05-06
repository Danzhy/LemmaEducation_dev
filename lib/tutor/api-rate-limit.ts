import { getTrustedClientIp, takeRateLimit } from '@/lib/request-rate-limit'
import { getNeonSql } from '@/lib/tutor/db'

export async function takeTutorApiRateLimit(
  request: Request,
  options: {
    endpoint: string
    maxHits: number
    windowSeconds: number
    userId?: string | null
    sessionId?: string | null
  }
) {
  const sql = getNeonSql()
  const subjectParts = [
    options.userId ? `user:${options.userId}` : `ip:${getTrustedClientIp(request)}`,
    options.sessionId ? `session:${options.sessionId}` : null,
  ].filter(Boolean)

  return takeRateLimit(sql, {
    endpoint: `tutor:${options.endpoint}`,
    subject: subjectParts.join('|'),
    maxHits: options.maxHits,
    windowSeconds: options.windowSeconds,
  })
}
