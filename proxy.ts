import type { NextFetchEvent, NextMiddleware, NextRequest } from 'next/server'
import { getAuth } from '@/lib/auth/neon-server'

let tutorMiddleware: NextMiddleware | undefined

function getTutorMiddleware(): NextMiddleware {
  if (tutorMiddleware === undefined) {
    // Neon bundles Next types; cast to app `NextMiddleware` for tsc.
    tutorMiddleware = getAuth().middleware({
      loginUrl: '/auth/sign-in',
    }) as unknown as NextMiddleware
  }
  return tutorMiddleware
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  return getTutorMiddleware()(request, event)
}

export const config = {
  matcher: ['/tutor'],
}
