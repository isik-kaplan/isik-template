import NewApplicationPage from '@/app/applications/new/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('@/components/app/PageShell', () => ({
  PageShell: ({
    title,
    description,
    backHref,
    backLabel,
    children,
  }: {
    title: string
    description?: string
    backHref: string
    backLabel: string
    children: React.ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <p data-testid="description">{description}</p>
      <a href={backHref}>{backLabel}</a>
      {children}
    </main>
  ),
}))
vi.mock('@/components/app-applications/RegisterApplication', () => ({
  RegisterApplication: ({ scopes }: { scopes: unknown }) => <p>register with {JSON.stringify(scopes)}</p>,
}))
const delegatableScopes = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ delegatableScopes }) }))

describe('NewApplicationPage', () => {
  it('registers one with what an application may ask for', async () => {
    delegatableScopes.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })

    render(await NewApplicationPage())

    expect(screen.getByRole('heading').textContent).toBe('Register an app')
    expect(screen.getByTestId('description').textContent).toBe(
      'It can sign people in once it is approved, and only ever asks each of them first.'
    )
    expect(screen.getByRole('link', { name: 'Back to your apps' }).getAttribute('href')).toBe('/applications')
    expect(screen.getByText('register with [{"name":"users:manage:user","label":"Manage people"}]')).toBeTruthy()
  })

  it('registers one asking for nothing beyond signing in when the scopes cannot be read', async () => {
    delegatableScopes.mockResolvedValue({ data: undefined })

    render(await NewApplicationPage())

    expect(screen.getByText('register with []')).toBeTruthy()
  })
})
