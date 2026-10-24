import { NextRequest } from 'next/server'

import { config, proxy } from '@/proxy'

import { describe, expect, it } from 'vitest'

function requestFor(path: string, { cookie }: { cookie?: string } = {}) {
  const headers = cookie ? { cookie } : undefined
  return new NextRequest(new URL(path, 'https://example.test'), { headers })
}

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
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'])
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
})
