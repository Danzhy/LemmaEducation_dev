import { getAuth } from '@/lib/auth/neon-server'

type AuthRouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type AuthHandler = (request: Request, context?: unknown) => Response | Promise<Response>

function createAuthRouteHandler(method: AuthRouteMethod): AuthHandler {
  return async (request, context) => {
    const handlers = getAuth().handler() as Record<AuthRouteMethod, AuthHandler>
    return handlers[method](request, context)
  }
}

export const GET = createAuthRouteHandler('GET')
export const POST = createAuthRouteHandler('POST')
export const PUT = createAuthRouteHandler('PUT')
export const PATCH = createAuthRouteHandler('PATCH')
export const DELETE = createAuthRouteHandler('DELETE')
