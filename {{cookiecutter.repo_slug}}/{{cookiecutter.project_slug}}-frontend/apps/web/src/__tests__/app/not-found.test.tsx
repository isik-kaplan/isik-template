import NotFound from '@/app/not-found'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('NotFound', () => {
  it('shows a message and a link back home', async () => {
    render(await NotFound())

    expect(screen.getByText('Page not found')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Back home' })
    expect(link.getAttribute('href')).toBe('/')
  })
})
