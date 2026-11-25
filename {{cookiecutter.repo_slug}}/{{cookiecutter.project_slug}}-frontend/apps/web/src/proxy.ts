import { type NextRequest, NextResponse } from 'next/server'

import { isAdminHost, siblingOrigin } from './lib/hosts'
import { requestOrigin } from './lib/requestOrigin'
import { PATH_HEADER, TOO_MANY_REQUESTS_PATH } from './lib/tooManyRequests'
import { DEFAULT_EXEMPT_PATTERNS, chainProxies, stripEmptyQueryParams } from '@isikk/core/next/middleware'

// An optimistic cookie check; requireSession() enforces. The name is hardcoded: no Django response yet.
const SESSION_COOKIE_NAME = 'sessionid'
// Signing in, the documents signup links to, and the page that says to wait: served on both hosts as they are.
const SHARED = [/^\/(auth|legal)(\/|$)/, new RegExp(`^${TOO_MANY_REQUESTS_PATH}$`)]
const PUBLIC_PATHS = [...DEFAULT_EXEMPT_PATTERNS, /^\/$/, ...SHARED]
const ADMIN_PUBLIC_PATHS = [...DEFAULT_EXEMPT_PATTERNS, ...SHARED]
// The admin's pages, which admin.<domain> serves at its root and the bare domain not at all. Named apart from the
// app's own, so a link from either host's shared chrome reaches the right one.
const ADMIN_SEGMENT = '/admin'
const ADMIN_PAGES = /^\/(people|groups|app-approvals|settings)?(\/|$)/

// The Host header nginx passes on: behind it, the URL Next builds names its own listening address instead.
const onAdminHost = (request: NextRequest) => isAdminHost(request.headers.get('host') ?? request.nextUrl.host)

function sendTheAdminToItsHost(request: NextRequest): NextResponse | undefined {
  const { pathname, search } = request.nextUrl
  if (onAdminHost(request) || !(pathname === ADMIN_SEGMENT || pathname.startsWith(`${ADMIN_SEGMENT}/`))) return
  const admin = siblingOrigin(requestOrigin(request.headers), 'admin')
  // /admin alone leaves an empty path, which the URL reads as the admin's root.
  return NextResponse.redirect(new URL(pathname.slice(ADMIN_SEGMENT.length) + search, admin))
}

function redirectAnonymousToAuth(request: NextRequest): NextResponse | undefined {
  const exempt = onAdminHost(request) ? ADMIN_PUBLIC_PATHS : PUBLIC_PATHS
  if (exempt.some((pattern) => pattern.test(request.nextUrl.pathname))) return
  if (request.cookies.has(SESSION_COOKIE_NAME)) return
  const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(new URL(`/auth/login?next=${next}`, request.url))
}

/** On admin.<domain>, anything but the admin's pages and what both hosts share is the app's: sent to it. */
function sendTheAppToItsHost(request: NextRequest): NextResponse | undefined {
  const { pathname, search } = request.nextUrl
  if (!onAdminHost(request) || [ADMIN_PAGES, ...ADMIN_PUBLIC_PATHS].some((pattern) => pattern.test(pathname))) return
  return NextResponse.redirect(new URL(pathname + search, siblingOrigin(requestOrigin(request.headers), null)))
}

/** The admin's own page a path on admin.<domain> is, under /admin. */
function adminPage(request: NextRequest): URL | undefined {
  const { pathname } = request.nextUrl
  if (!onAdminHost(request) || !ADMIN_PAGES.test(pathname)) return
  const url = request.nextUrl.clone()
  // The root is /admin/, which Next reads as /admin.
  url.pathname = `${ADMIN_SEGMENT}${pathname}`
  return url
}

const guard = chainProxies(stripEmptyQueryParams, sendTheAdminToItsHost, sendTheAppToItsHost, redirectAnonymousToAuth)

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await guard(request)
  if (response) return response
  // Which page this is, for a Server Component to offer again (lib/tooManyRequests.ts).
  const headers = new Headers(request.headers)
  headers.set(PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search)
  const page = adminPage(request)
  return page ? NextResponse.rewrite(page, { request: { headers } }) : NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon/|apple-icon).*)'],
}
