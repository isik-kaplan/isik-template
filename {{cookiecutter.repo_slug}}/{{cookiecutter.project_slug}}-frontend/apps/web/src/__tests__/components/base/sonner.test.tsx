import { Toaster } from '@/components/base/sonner'

import { render, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => useThemeMock() }))

describe('Toaster', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders, forwarding the resolved theme to sonner', () => {
    useThemeMock.mockReturnValue({ theme: 'dark' })

    render(<Toaster />)

    // Portalled straight to document.body, not into the render container.
    expect(document.querySelector('section[aria-label^="Notifications"]')).toBeTruthy()
  })

  it('defaults to the system theme when next-themes has none yet', async () => {
    useThemeMock.mockReturnValue({})

    render(<Toaster />)
    // The toaster's own root element isn't in the DOM until there is at least one toast.
    toast('Done')
    await waitFor(() => expect(document.body.textContent).toContain('Done'))

    // sonner resolves "system" against prefers-color-scheme and mirrors the result onto this
    // attribute - an empty string (an unrecognized theme, e.g. a missing default) is left as
    // empty instead, so this still tells the two apart.
    expect(document.querySelector('[data-sonner-toaster]')?.getAttribute('data-sonner-theme')).toBe('light')
  })

  it('shows our own lucide icon on a toast, not a default one', async () => {
    useThemeMock.mockReturnValue({ theme: 'light' })

    render(<Toaster />)
    toast.success('Done')

    await waitFor(() => expect(document.body.textContent).toContain('Done'))
    expect(document.querySelector('.lucide-circle-check')).toBeTruthy()
  })
})
