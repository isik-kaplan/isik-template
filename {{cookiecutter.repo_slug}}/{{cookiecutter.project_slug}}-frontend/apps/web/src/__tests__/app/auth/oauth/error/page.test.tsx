import OAuthErrorPage from '@/app/auth/oauth/error/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('OAuthErrorPage', () => {
  it('says the app cannot sign anybody in, that nothing was shared, and leads home', async () => {
    render(await OAuthErrorPage())

    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('This app cannot sign you in')
    expect(screen.getByText(/Nothing was shared with it/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
  })
})
