import DeletionScheduledPage from '@/app/auth/deletion-scheduled/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('DeletionScheduledPage', () => {
  it('says when, in the visitor language, and how to keep the account', async () => {
    render(await DeletionScheduledPage({ searchParams: Promise.resolve({ on: '2026-12-07T10:00:00Z' }) }))

    expect(screen.getByText('Your account will be deleted')).toBeTruthy()
    expect(
      screen.getByText(
        "It will be deleted on December 7, 2026, and you've been signed out everywhere until then. Changed your mind? Sign in before then and it stays as it is."
      )
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in to keep my account' }).getAttribute('href')).toBe('/auth/login')
  })

  it.each([undefined, 'not a date'])('says it without a date it cannot read: %s', async (on) => {
    render(await DeletionScheduledPage({ searchParams: Promise.resolve({ on }) }))

    expect(
      screen.getByText(
        "You've been signed out everywhere until it happens. Changed your mind? Sign in before then and it stays as it is."
      )
    ).toBeTruthy()
  })
})
