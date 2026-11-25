import { NextRequest } from 'next/server'

import AppleIcon, { size as appleSize } from '@/app/apple-icon'
import Icon, { generateImageMetadata } from '@/app/icon'
import manifest from '@/app/manifest'
import { APPLE_ICON_SIZE, ICON_SIZES } from '@/lib/brandIcon'
import { proxy } from '@/proxy'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({ readFile: async () => Buffer.from('a png') }))
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(
      readonly element: { props: { src: string; width: number } },
      readonly options: { width: number; height: number }
    ) {}
  },
}))

const segment = fc.stringMatching(/^[a-z0-9-]{1,10}$/)
const privatePath = fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => `/${parts.join('/')}`)

describe('the proxy in front of every page', () => {
  test.prop([privatePath, fc.webQueryParameters()])(
    'sends somebody with no session cookie to log in, carrying where they were going',
    async (path, query) => {
      fc.pre(!/^\/(auth|legal|too-many-requests)(\/|$)/.test(path))
      const search = query ? `?${query}&kept=1` : ''
      // Followed, as a browser would: an empty parameter is first stripped by a redirect of its own.
      let location = `http://test-project.test${path}${search}`
      for (let hop = 0; hop < 3 && new URL(location).pathname !== '/auth/login'; hop++) {
        location = (await proxy(new NextRequest(location))).headers.get('location') ?? location
      }
      expect(new URL(location).pathname).toBe('/auth/login')
      expect(new URL(location).searchParams.get('next')?.startsWith(path)).toBe(true)
    }
  )

  test.prop([
    fc.constantFrom('/', '/auth/login', '/auth/signup', '/legal', '/legal/terms-of-service', '/too-many-requests'),
    fc.boolean(),
  ])('lets anybody through to the public pages, telling the page which one it is', async (path, signedIn) => {
    const request = new NextRequest(`http://test-project.test${path}`, {
      headers: signedIn ? { cookie: 'sessionid=abc' } : {},
    })
    const response = await proxy(request)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-request-x-page-path')).toBe(path)
  })

  test.prop([privatePath])('lets somebody with a session cookie through anywhere', async (path) => {
    const response = await proxy(
      new NextRequest(`http://test-project.test${path}`, { headers: { cookie: 'sessionid=abc' } })
    )
    expect(response.headers.get('location')).toBeNull()
  })
})

describe('the proxy in front of the admin', () => {
  const ADMIN = 'http://admin.test-project.test'
  const adminPage = fc.tuple(
    fc.constantFrom('people', 'groups', 'app-approvals', 'settings'),
    fc.array(segment, { maxLength: 2 })
  )

  test.prop([adminPage, fc.boolean()])(
    "serves the admin's pages from under /admin, and sends a bare-domain /admin address to them",
    async ([section, rest], viaApp) => {
      const path = ['', section, ...rest].join('/')
      const signedIn = { headers: { cookie: 'sessionid=abc' } }
      if (viaApp) {
        const redirected = await proxy(new NextRequest(`http://test-project.test/admin${path}`, signedIn))
        expect(redirected.headers.get('location')).toBe(`${ADMIN}${path}`)
      }
      const served = await proxy(new NextRequest(`${ADMIN}${path}`, signedIn))
      expect(served.headers.get('x-middleware-rewrite')).toBe(`${ADMIN}/admin${path}`)
      // As Next sees it behind nginx: its own address, and the browser's host in the header.
      const behind = { headers: { ...signedIn.headers, host: 'admin.test-project.test' } }
      const proxied = await proxy(new NextRequest(`http://0.0.0.0:3000${path}`, behind))
      expect(proxied.headers.get('x-middleware-rewrite')).toBe(`http://0.0.0.0:3000/admin${path}`)
    }
  )

  test('sends /admin itself to the admin, which opens at its root', async () => {
    const signedIn = { headers: { cookie: 'sessionid=abc' } }
    const redirected = await proxy(new NextRequest('http://test-project.test/admin', signedIn))
    expect(redirected.headers.get('location')).toBe(`${ADMIN}/`)
    const served = await proxy(new NextRequest(`${ADMIN}/`, signedIn))
    expect(served.headers.get('x-middleware-rewrite')).toBe(`${ADMIN}/admin`)
  })

  test.prop([privatePath, fc.boolean()])(
    'sends anything else asked of the admin host to the app, keeping what it shares with it',
    async (path, signedIn) => {
      fc.pre(!/^\/(people|groups|app-approvals|settings)(\/|$)/.test(path))
      const request = new NextRequest(`${ADMIN}${path}`, { headers: signedIn ? { cookie: 'sessionid=abc' } : {} })
      const location = (await proxy(request)).headers.get('location')
      if (/^\/(auth|legal|too-many-requests)(\/|$)/.test(path)) expect(location).toBeNull()
      else expect(location).toBe(`http://test-project.test${path}`)
    }
  )
})

describe('the brand icon', () => {
  test('is drawn at every size the tab, the install prompt and an Apple device ask for', async () => {
    expect(generateImageMetadata().map((entry) => entry.size.width)).toEqual(ICON_SIZES)
    for (const size of ICON_SIZES) {
      const drawn = (await Icon({ id: Promise.resolve(String(size)) })) as unknown as {
        options: { width: number }
        element: { props: { src: string } }
      }
      expect(drawn.options.width).toBe(size)
      expect(drawn.element.props.src).toBe(`data:image/png;base64,${Buffer.from('a png').toString('base64')}`)
    }
    const apple = (await AppleIcon()) as unknown as { options: { width: number } }
    expect([apple.options.width, appleSize.width]).toEqual([APPLE_ICON_SIZE, APPLE_ICON_SIZE])
  })

  test('is offered for installing only at the sizes a browser installs from', () => {
    const offered = manifest().icons ?? []
    expect(offered.map((icon) => icon.sizes)).toEqual(
      ICON_SIZES.filter((size) => size >= 192).map((size) => `${size}x${size}`)
    )
    for (const icon of offered) expect(icon.src).toBe(`/icon/${icon.sizes?.split('x')[0]}`)
  })
})
