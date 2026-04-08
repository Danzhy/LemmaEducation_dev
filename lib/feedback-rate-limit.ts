/** In-memory sliding window per IP. Best-effort only on serverless (per instance). */

const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 8
const MAX_BUCKETS = 5000

const buckets = new Map<string, number[]>()

function prune(ip: string, now: number) {
  const arr = buckets.get(ip)
  if (!arr) return
  const next = arr.filter((t) => now - t < WINDOW_MS)
  if (next.length === 0) buckets.delete(ip)
  else buckets.set(ip, next)
}

export function isFeedbackRateLimited(ip: string): boolean {
  const now = Date.now()
  prune(ip, now)
  const recent = buckets.get(ip) ?? []
  if (recent.length >= MAX_REQUESTS) return true

  recent.push(now)
  buckets.set(ip, recent)

  if (buckets.size > MAX_BUCKETS) {
    for (const key of [...buckets.keys()].slice(0, buckets.size - MAX_BUCKETS + 100)) {
      prune(key, now)
    }
  }
  return false
}

export function getClientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for')
  if (xf) {
    const first = xf.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
