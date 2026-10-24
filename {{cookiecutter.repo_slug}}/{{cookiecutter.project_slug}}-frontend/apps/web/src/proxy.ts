import { type NextRequest, NextResponse } from 'next/server'

import { PATH_HEADER, TOO_MANY_REQUESTS_PATH } from './lib/tooManyRequests'
import { DEFAULT_EXEMPT_PATTERNS, chainProxies, stripEmptyQueryParams } from '@isikk/core/next/middleware'

// An optimistic cookie check; requireSession() enforces. The name is hardcoded: no Django response yet.
const SESSION_COOKIE_NAME = 'sessionid'
const PUBLIC_PATHS = [
  ...DEFAULT_EXEMPT_PATTERNS,
  /^\/$/,
  /^\/(auth|legal)(\/|$)/,
  new RegExp(`^${TOO_MANY_REQUESTS_PATH}$`),
]

function redirectAnonymousToAuth(request: NextRequest): NextResponse | undefined {
  if (PUBLIC_PATHS.some((pattern) => pattern.test(request.nextUrl.pathname))) return
  if (request.cookies.has(SESSION_COOKIE_NAME)) return
  const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(new URL(`/auth/login?next=${next}`, request.url))
}

const guard = chainProxies(stripEmptyQueryParams, redirectAnonymousToAuth)

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await guard(request)
  if (response) return response
  // Which page this is, for a Server Component to offer again (lib/tooManyRequests.ts).
  const headers = new Headers(request.headers)
  headers.set(PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
}
