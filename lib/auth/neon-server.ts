import { createNeonAuth } from '@neondatabase/neon-js/auth/next/server'

function loadNeonAuthConfig() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL
  const secret = process.env.NEON_AUTH_COOKIE_SECRET
  if (!baseUrl?.trim()) {
    throw new Error('NEON_AUTH_BASE_URL is required for Neon Auth')
  }
  if (!secret || secret.length < 32) {
    throw new Error('NEON_AUTH_COOKIE_SECRET must be set and at least 32 characters')
  }
  return {
    baseUrl: baseUrl.trim(),
    cookies: {
      secret,
    },
  } as const
}

type NeonAuthInstance = ReturnType<typeof createNeonAuth>

let authSingleton: NeonAuthInstance | null = null

/**
 * Lazy singleton so importing this module does not throw until auth is actually used.
 * Middleware only invokes this when a request matches `/tutor`.
 */
export function getAuth(): NeonAuthInstance {
  if (!authSingleton) {
    authSingleton = createNeonAuth(loadNeonAuthConfig())
  }
  return authSingleton
}
