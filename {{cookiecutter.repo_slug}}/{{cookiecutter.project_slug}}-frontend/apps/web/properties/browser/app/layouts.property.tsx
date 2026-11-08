/// <reference types="vite/client" />
import { type Drawn } from '../../support/arbitraries'
import { type Answers, type Visitor, backend, world } from '../../support/backend'
import { freshDom } from '../../support/dom'
import { requestCookies, requestHeaders } from '../../support/requests'
import { resolveServerTree } from '../../support/serverTree'
import { test } from '@fast-check/vitest'
import { render } from '@testing-library/react'
import fc from 'fast-check'
import { beforeAll, describe, expect, vi } from 'vitest'

// Globbed, so a new layout is swept the day it lands.
const found = import.meta.glob('../../../src/app/**/layout.tsx')

const layouts = Object.entries(found).map(([file, load]) => ({
  segment: file.replace('../../../src/app/', '').replace(/\/?layout\.tsx$/, ''),
  load: load as () => Promise<{ default: (props: { children: React.ReactNode }) => unknown }>,
}))

// The segments a visitor must be signed in to see anything of: pinned, so a gate dropped is a failure here.
const GATED = ['applications', 'profile', 'staff', 'webhooks']

const MARKER = 'the page this layout wraps'

async function wrap(layout: (typeof layouts)[number], visitor: Visitor, answering: Answers, w: Drawn<typeof world>) {
  freshDom()
  requestHeaders.value = new Headers({ host: 'test-project.test', cookie: 'sessionid=abc' })
  requestCookies.value = { sessionid: 'abc' }
  vi.stubGlobal('fetch', backend(w, visitor, answering) as unknown as typeof fetch)
  try {
    const { default: Layout } = await layout.load()
    const node = await Layout({ children: <p>{MARKER}</p> })
    render(<>{(await resolveServerTree(node as React.ReactNode)) as React.ReactNode}</>)
    // A root layout's <html> and <body> are hoisted into the document, so the whole document is read.
    return { stopped: false, leaked: document.documentElement.innerHTML.includes(MARKER) }
  } catch (error) {
    const message = (error as Error).message
    if (message !== 'NEXT_NOT_FOUND' && !message.startsWith('NEXT_REDIRECT')) throw error
    return { stopped: true, leaked: false }
  }
}

describe('every layout', () => {
  beforeAll(async () => {
    await Promise.all(layouts.map((layout) => layout.load()))
  })

  test('has its gated segments found by the sweep', () => {
    expect(layouts.map((layout) => layout.segment)).toEqual(
      expect.arrayContaining(GATED.filter((s) => s !== 'webhooks'))
    )
  })

  test.prop([world, fc.constantFrom<Answers>('everything', 'no collections', 'nothing at all')])(
    'never shows a gated page to somebody signed out',
    async (w, answering) => {
      for (const layout of layouts.filter((l) => GATED.some((segment) => l.segment.startsWith(segment)))) {
        const wrapped = await wrap(layout, 'anonymous', answering, w)
        expect(wrapped.leaked, layout.segment).toBe(false)
      }
    }
  )

  test.prop([world, fc.constantFrom<Visitor>('member', 'staff', 'superuser')])(
    'shows its page to somebody signed in',
    async (w, visitor) => {
      for (const layout of layouts) {
        const wrapped = await wrap(layout, visitor, 'everything', w)
        expect(wrapped.stopped || wrapped.leaked, layout.segment).toBe(true)
        if (!layout.segment.startsWith('applications')) expect(wrapped.leaked, layout.segment).toBe(true)
      }
    }
  )

  test.prop([world])('shows the signed-out pages to somebody signed out', async (w) => {
    for (const layout of layouts.filter((l) => !GATED.some((segment) => l.segment.startsWith(segment)))) {
      const wrapped = await wrap(layout, 'anonymous', 'everything', w)
      expect(wrapped.leaked, layout.segment).toBe(true)
    }
  })
})
