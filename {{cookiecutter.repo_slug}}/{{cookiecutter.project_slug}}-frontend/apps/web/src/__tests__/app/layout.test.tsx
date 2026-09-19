import RootLayout, { metadata } from '@/app/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ getSession: (...args: unknown[]) => getSession(...args) }))
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

  it('sets the page title and description from this project', () => {
    expect(metadata.title).toBe('Test Project')
    expect(metadata.description).toBeTruthy()
  })
})
