import { LegalTabsList } from '@/components/app-legal/LegalTabsList'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
let pathname = '/legal/terms-of-service'
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }))

describe('LegalTabsList', () => {
  beforeEach(() => {
    push.mockClear()
    pathname = '/legal/terms-of-service'
  })

  it('is a labelled tab strip with one tab per document, in order', () => {
    render(<LegalTabsList />)

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent)
    expect(tabs).toEqual(['Terms of Service', 'Privacy Policy'])
    expect(screen.getByRole('tablist', { name: 'Legal documents' })).toBeTruthy()
  })

  it("selects the current page's document", () => {
    pathname = '/legal/privacy-policy'
    render(<LegalTabsList />)

    expect(screen.getByRole('tab', { name: 'Privacy Policy' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Terms of Service' }).getAttribute('aria-selected')).toBe('false')
  })

  it('selects nothing on a path that only shares a prefix with a document', () => {
    pathname = '/legal/privacy-policy-old'
    render(<LegalTabsList />)

    for (const tab of screen.getAllByRole('tab')) expect(tab.getAttribute('aria-selected')).toBe('false')
  })

  it("navigates to a document's page when its tab is chosen", async () => {
    const user = userEvent.setup()
    render(<LegalTabsList />)

    await user.click(screen.getByRole('tab', { name: 'Privacy Policy' }))

    expect(push).toHaveBeenCalledWith('/legal/privacy-policy')
  })
})
