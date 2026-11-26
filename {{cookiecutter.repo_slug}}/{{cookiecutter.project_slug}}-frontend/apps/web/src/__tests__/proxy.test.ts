import { NextRequest } from 'next/server'

import { config, proxy } from '@/proxy'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'example.test' } }))

function requestFor(path: string, { cookie, host = 'example.test' }: { cookie?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host, 'x-forwarded-proto': 'https' }
  if (cookie) headers.cookie = cookie
  return new NextRequest(new URL(path, `https://${host}`), { headers })
}

const onAdmin = (path: string, cookie?: string) => requestFor(path, { cookie, host: 'admin.example.test' })
const SIGNED_IN = 'sessionid=abc'

describe('proxy', () => {
  it('lets an anonymous visitor through on the home page', async () => {
    const response = await proxy(requestFor('/'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('lets an anonymous visitor through on any /auth page', async () => {
    const response = await proxy(requestFor('/auth/login'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects an anonymous visitor away from a protected page, preserving where they were going', async () => {
    const response = await proxy(requestFor('/profile/emails?tab=1'))

    expect(response.headers.get('location')).toBe('https://example.test/auth/login?next=%2Fprofile%2Femails%3Ftab%3D1')
  })

  it('lets a visitor with a session cookie through to a protected page', async () => {
    const response = await proxy(requestFor('/profile/emails', { cookie: 'sessionid=abc' }))

    expect(response.headers.get('location')).toBeNull()
  })

  it('strips an empty query param before the auth check ever runs', async () => {
    const response = await proxy(requestFor('/profile/emails?tab='))

    // To the same path without the param, not to login, despite no session cookie.
    expect(response.headers.get('location')).toBe('https://example.test/profile/emails')
  })

  it('lets an anonymous visitor read the legal documents, which signup links to', async () => {
    for (const path of ['/legal', '/legal/terms-of-service']) {
      expect((await proxy(requestFor(path))).headers.get('location')).toBeNull()
    }
  })

  it('redirects a path that only starts like /legal', async () => {
    const response = await proxy(requestFor('/legalese'))

    expect(response.headers.get('location')).toBe('https://example.test/auth/login?next=%2Flegalese')
  })

  it('treats bare "/auth" (no trailing slash) as public too', async () => {
    const response = await proxy(requestFor('/auth'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects a protected path that happens to end in a slash', async () => {
    const response = await proxy(requestFor('/profile/emails/'))

    expect(response.headers.get('location')).toBe('https://example.test/auth/login?next=%2Fprofile%2Femails%2F')
  })

  it('redirects a protected path that merely contains "/auth" mid-path', async () => {
    const response = await proxy(requestFor('/profile/auth/emails'))

    expect(response.headers.get('location')).toBe('https://example.test/auth/login?next=%2Fprofile%2Fauth%2Femails')
  })

  it('matches every path except Next.js internals, the favicon, and the manifest', () => {
    expect(config.matcher).toEqual([
      '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon/|apple-icon).*)',
    ])
  })

  it('lets an anonymous visitor through to the page that says to wait', async () => {
    const response = await proxy(requestFor('/too-many-requests'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('still guards a page whose path merely starts like it', async () => {
    const response = await proxy(requestFor('/too-many-requests-and-more'))

    expect(response.headers.get('location')).toContain('/auth/login')
  })

  it("lets an anonymous visitor fetch the files a crawler or browser asks for, which Next's matcher lets in", async () => {
    for (const path of ['/robots.txt', '/.well-known/security.txt']) {
      expect((await proxy(requestFor(path))).headers.get('location')).toBeNull()
    }
  })

  it('tells the page it renders which page that is, query and all', async () => {
    const response = await proxy(requestFor('/profile/emails?tab=1', { cookie: 'sessionid=abc' }))

    expect(response.headers.get('x-middleware-request-x-page-path')).toBe('/profile/emails?tab=1')
  })

  it('sends a visit to /admin on the bare domain to the admin host, keeping the rest of the address', async () => {
    const response = await proxy(requestFor('/admin/people/u1?tab=1', { cookie: SIGNED_IN }))

    expect(response.headers.get('location')).toBe('https://admin.example.test/people/u1?tab=1')
  })

  it("sends /admin itself to the admin host's root", async () => {
    const response = await proxy(requestFor('/admin'))

    expect(response.headers.get('location')).toBe('https://admin.example.test/')
  })

  it('leaves a path that only starts like /admin to the app', async () => {
    const response = await proxy(requestFor('/administrators', { cookie: SIGNED_IN }))

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it.each([
    ['/', '/admin'],
    ['/people', '/admin/people'],
    ['/groups/g1', '/admin/groups/g1'],
    ['/app-approvals/7', '/admin/app-approvals/7'],
    ['/settings?x=1', '/admin/settings?x=1'],
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
    ['/scheduled-tasks', '/admin/scheduled-tasks'],
{%- endif %}
  ])('serves %s on the admin host from the admin page %s', async (path, page) => {
    const response = await proxy(onAdmin(path, SIGNED_IN))

    expect(response.headers.get('x-middleware-rewrite')).toBe(`https://admin.example.test${page}`)
    expect(response.headers.get('x-middleware-request-x-page-path')).toBe(path)
  })

  it("sends an app page whose path only ends like an admin page's to the app", async () => {
    const response = await proxy(onAdmin('/profile/people', SIGNED_IN))

    expect(response.headers.get('location')).toBe('https://example.test/profile/people')
  })

  it('sends an app page asked of the admin host to the app, keeping the rest of the address', async () => {
    const response = await proxy(onAdmin('/profile/notifications?all=1', SIGNED_IN))

    expect(response.headers.get('location')).toBe('https://example.test/profile/notifications?all=1')
  })

  it('serves signing in, the documents and the page that says to wait on the admin host as they are', async () => {
    for (const path of ['/auth/login', '/legal/terms-of-service', '/too-many-requests']) {
      const response = await proxy(onAdmin(path))

      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    }
  })

  it("leaves Next's own files on the admin host where they are", async () => {
    const response = await proxy(onAdmin('/_next/data/x.json', SIGNED_IN))

    expect(response.headers.get('location')).toBeNull()
  })

  it('sends an anonymous visitor to the admin host to sign in there, the root included', async () => {
    const response = await proxy(onAdmin('/'))

    expect(response.headers.get('location')).toBe('https://admin.example.test/auth/login?next=%2F')
  })

  it('takes the host from the Host header, which behind nginx is the one the browser asked for', async () => {
    const headers = { host: 'admin.example.test', cookie: SIGNED_IN }
    const response = await proxy(new NextRequest('http://0.0.0.0:3000/people', { headers }))

    expect(response.headers.get('x-middleware-rewrite')).toBe('http://0.0.0.0:3000/admin/people')
  })

  it('falls back to the address asked for when no Host header came with it', async () => {
    const response = await proxy(
      new NextRequest('https://admin.example.test/people', { headers: { cookie: SIGNED_IN } })
    )

    expect(response.headers.get('x-middleware-rewrite')).toBe('https://admin.example.test/admin/people')
  })
})
