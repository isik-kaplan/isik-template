import { PageShell } from '@/components/app/PageShell'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/app-auth/LanguageSwitcher', () => ({ LanguageSwitcher: () => <p>languages</p> }))
vi.mock('@/components/app/ThemeToggle', () => ({ ThemeToggle: () => <p>theme</p> }))

describe('PageShell', () => {
  it('titles the page, says what it is for and leads back', () => {
    render(
      <PageShell title="Your apps" description="What these are" backHref="/" backLabel="Back home">
        <p>the content</p>
      </PageShell>
    )

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your apps')
    expect(screen.getByText('What these are')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back home' }).getAttribute('href')).toBe('/')
    expect(screen.getByText('the content')).toBeTruthy()
    expect(screen.getByText('languages')).toBeTruthy()
    expect(screen.getByText('theme')).toBeTruthy()
  })

  it('leaves the description out when there is none', () => {
    render(
      <PageShell title="Your apps" backHref="/" backLabel="Back home">
        <p>the content</p>
      </PageShell>
    )

    expect(screen.getByRole('main').querySelectorAll('header p')).toHaveLength(0)
  })
})
