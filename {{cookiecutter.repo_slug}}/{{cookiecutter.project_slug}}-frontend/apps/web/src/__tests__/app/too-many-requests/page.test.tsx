import TooManyRequests from '@/app/too-many-requests/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

async function rendered(next?: string) {
  render(await TooManyRequests({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }))
}

describe('TooManyRequests', () => {
  it('says to wait, and offers the page that was refused once they have', async () => {
    await rendered('/staff/people?page=2')

    expect(screen.getByRole('heading', { name: 'Too many requests' })).toBeTruthy()
    expect(screen.getByText('Too many requests. Wait a moment, then try again.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/staff/people?page=2')
  })

  it('offers home for a page it was not told, or one on another site', async () => {
    await rendered('//evil.test/')

    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/')
  })
})
