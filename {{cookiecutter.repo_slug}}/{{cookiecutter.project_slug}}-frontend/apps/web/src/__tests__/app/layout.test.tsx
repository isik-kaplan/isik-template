import RootLayout, { metadata } from '@/app/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('@/lib/getSession', () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  getLanguage: async () => 'en',
}))
vi.mock('@/app/monkeypatches', () => ({ default: () => <div data-testid="monkeypatches" /> }))
vi.mock('@/config/public', () => ({ PublicConfigScript: () => <div data-testid="public-config-script" /> }))

describe('RootLayout', () => {
  it('renders its children, wrapped in the app providers', async () => {
    getSession.mockResolvedValue({ user: { id: '1', username: 'jane', email: 'j@test.test' } })

    render(await RootLayout({ children: <p>content</p> }))

    expect(screen.getByText('content')).toBeTruthy()
    // React 19 hoists <head> content (this component's own MonkeyPatches child) straight to the
    // real document.head, rather than rendering it where the tree places it.
    expect(document.head.querySelector('[data-testid="monkeypatches"]')).toBeTruthy()
    expect(screen.getByTestId('public-config-script')).toBeTruthy()
  })

  it('ends every page with the footer, below the page itself', async () => {
    getSession.mockResolvedValue(null)

    render(await RootLayout({ children: <p>content</p> }))

    const footer = screen.getByRole('contentinfo')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeTruthy()
    expect(screen.getByText('content').compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sets the page title and description from this project', () => {
    expect(metadata.title).toBe('{{ cookiecutter.project_name }}')
    expect(metadata.description).toBeTruthy()
  })
})
