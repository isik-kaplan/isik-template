import LegalLayout from '@/app/legal/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/legal/privacy-policy', useRouter: () => ({ push: vi.fn() }) }))

describe('LegalLayout', () => {
  it('puts the document tabs above the page and a way home below it', async () => {
    render(await LegalLayout({ children: <p>document</p> }))

    expect(screen.getByRole('tablist', { name: 'Legal documents' })).toBeTruthy()
    expect(screen.getByRole('main').textContent).toContain('document')
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
  })
})
