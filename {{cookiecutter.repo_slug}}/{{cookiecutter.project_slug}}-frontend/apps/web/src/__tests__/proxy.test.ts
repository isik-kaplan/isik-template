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

    // stripEmptyQueryParams redirects to the same path with the param removed - not to login,
    // even though this visitor has no session cookie either.
    expect(response.headers.get('location')).toBe('https://example.test/profile/emails')
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
})
