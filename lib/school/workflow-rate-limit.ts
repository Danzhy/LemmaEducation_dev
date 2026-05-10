import { getTrustedClientIp, takeRateLimit } from '@/lib/request-rate-limit'
import { getNeonSql } from '@/lib/tutor/db'

export async function takeSchoolWorkflowRateLimit(
  request: Request,
  options: {
    endpoint: string
    userId: string
    maxHits: number
    windowSeconds: number
  }
) {
  const sql = getNeonSql()
  return takeRateLimit(sql, {
    endpoint: `school:${options.endpoint}`,
    subject: `user:${options.userId}|ip:${getTrustedClientIp(request)}`,
    maxHits: options.maxHits,
    windowSeconds: options.windowSeconds,
  })
}

export function schoolRateLimitResponse(
  message: string,
  retryAfterSeconds: number
) {
  return {
    ok: false,
    code: 'RATE_LIMITED',
    message,
    retryAfterSeconds,
  }
}
