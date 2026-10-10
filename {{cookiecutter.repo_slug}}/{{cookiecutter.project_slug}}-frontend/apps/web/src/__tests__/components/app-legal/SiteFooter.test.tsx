import { SiteFooter } from '@/components/app-legal/SiteFooter'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('SiteFooter', () => {
  it('links every legal document from a labelled navigation list', () => {
    render(<SiteFooter />)

    const nav = screen.getByRole('navigation', { name: 'Legal' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Terms of Service', '/legal/terms-of-service'],
      ['Privacy Policy', '/legal/privacy-policy'],
    ])
  })

  it('discloses the cookies in one line, linking to the section that lists them', () => {
    render(<SiteFooter />)

    expect(screen.getByRole('contentinfo').textContent).toContain(
      'This site uses only the cookies and storage it needs to sign you in and remember your choices. Cookies'
    )
    const link = screen.getByRole('link', { name: 'Cookies and storage' })
    expect(link.getAttribute('href')).toBe('/legal/privacy-policy#cookies')
  })

  it('leaves the cookie line out when no document carries the disclosure to link to', async () => {
    vi.resetModules()
    vi.doMock('@/legal/documents.json', () => ({ default: { documents: [{ slug: 'terms-of-service' }] } }))
    const { SiteFooter: Footer } = await import('@/components/app-legal/SiteFooter')

    render(<Footer />)

    expect(screen.queryByText(/This site uses only the cookies/)).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    vi.doUnmock('@/legal/documents.json')
  })
})
