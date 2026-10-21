import { type NextRequest, NextResponse } from 'next/server'

import { PATH_HEADER, TOO_MANY_REQUESTS_PATH } from './lib/tooManyRequests'
import { stripEmptyQueryParams } from '@isikk/core/next/middleware'

// Optimistic cookie-presence check only, never authoritative - real auth is enforced server-side
// by each page/layout that calls requireSession(). django's sessionid cookie name, hardcoded:
// this proxy runs before any Django response exists to read the real cookie name from.
const SESSION_COOKIE_NAME = 'sessionid'
const PUBLIC_PATH = new RegExp(`^/$|^/(auth|legal)(/|$)|^${TOO_MANY_REQUESTS_PATH}$`)

function redirectAnonymousToAuth(request: NextRequest): NextResponse | undefined {
  if (PUBLIC_PATH.test(request.nextUrl.pathname)) return
  if (request.cookies.has(SESSION_COOKIE_NAME)) return
  const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(new URL(`/auth/login?next=${next}`, request.url))
}

const proxies = [stripEmptyQueryParams, redirectAnonymousToAuth]

export async function proxy(request: NextRequest): Promise<NextResponse> {
  for (const p of proxies) {
    const response = await p(request)
    if (response) return response
  }
  // Which page this is, for a Server Component to offer again (lib/tooManyRequests.ts).
  const headers = new Headers(request.headers)
  headers.set(PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
}
