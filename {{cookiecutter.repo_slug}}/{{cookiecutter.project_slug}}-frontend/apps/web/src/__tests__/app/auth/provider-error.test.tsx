import ProviderErrorPage from '@/app/auth/provider-error/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('ProviderErrorPage', () => {
  it('shows the generic error and a link back to login by default', async () => {
    render(await ProviderErrorPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('That sign-in provider ran into an error. Try again.')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Back to login' })
    expect(link.getAttribute('href')).toBe('/auth/login')
  })

  it('shows the cancelled-specific copy for a cancelled error', async () => {
    render(await ProviderErrorPage({ searchParams: Promise.resolve({ error: 'cancelled' }) }))

    expect(screen.getByText('Sign-in canceled')).toBeTruthy()
    expect(screen.getByText('You canceled before finishing. Nothing was changed.')).toBeTruthy()
  })

  it('points back to connections when the error happened mid-connect', async () => {
    render(await ProviderErrorPage({ searchParams: Promise.resolve({ error_process: 'connect' }) }))

    const link = screen.getByRole('link', { name: 'Back to connections' })
    expect(link.getAttribute('href')).toBe('/profile/connections')
  })

  it('points back to login when the error did not happen mid-connect', async () => {
    render(await ProviderErrorPage({ searchParams: Promise.resolve({ error_process: 'login' }) }))

    const link = screen.getByRole('link', { name: 'Back to login' })
    expect(link.getAttribute('href')).toBe('/auth/login')
  })
})
