import ApplicationReviewsPage from '@/app/staff/applications/page'

import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
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
vi.mock('@/components/app/Filters/ResourceFilters', () => ({
  ResourceFilters: ({
    specs,
  }: {
    specs: { name: string; label: string; anyLabel: string; options: { value: string; label: string }[] }[]
  }) => (
    <p>
      filters{' '}
      {specs
        .map(
          (spec) =>
            `${spec.name}(${spec.label}|${spec.anyLabel})=${spec.options.map((option) => `${option.value}:${option.label}`).join('/')}`
        )
        .join(' ')}
    </p>
  ),
}))
vi.mock('@/components/app/ResourcePaginator', () => ({
  ResourcePaginator: async ({ totalPages }: { totalPages: number }) => <p>pages {totalPages}</p>,
}))
const me = vi.fn()
const oauthApplicationReviews = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, oauthApplicationReviews }) }))

const page = (asked: Record<string, string> = {}) => ApplicationReviewsPage({ searchParams: Promise.resolve(asked) })

describe('ApplicationReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
    me.mockResolvedValue({ data: { is_superuser: true } })
    oauthApplicationReviews.mockResolvedValue({
      data: { total_pages: 2, results: [{ id: 7, name: 'Acme', approval: 'pending', owner: 'bob' }] },
    })
  })

  it.each([{ data: undefined }, { data: { is_superuser: false } }])(
    'is not found for anybody but a superuser',
    async (answer) => {
      me.mockResolvedValue(answer)

      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
      expect(oauthApplicationReviews).not.toHaveBeenCalled()
    }
  )

  it('lists every application with where it stands and whose it is, narrowed by the address bar', async () => {
    render(await page({ approval: 'pending' }))

    expect(oauthApplicationReviews).toHaveBeenCalledWith({ approval: 'pending', page: 1, page_size: 25 })
    expect(screen.getByRole('heading').textContent).toBe('App approvals')
    expect(screen.getByTestId('description').textContent).toBe(
      'Every app registered here, the ones waiting for an answer first.'
    )
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(
      screen.getByText(
        'filters approval(Standing|Any)=pending:Waiting for approval/approved:Approved/disabled:Switched off/withdrawn:Withdrawn'
      )
    ).toBeTruthy()
    expect(screen.getByText('pages 2')).toBeTruthy()
    const acme = screen.getByRole('link', { name: 'Acme' })
    expect(acme.getAttribute('href')).toBe('/staff/applications/7')
    const row = within(acme.closest('li') as HTMLElement)
    expect(row.getByText('Waiting for approval')).toBeTruthy()
    expect(row.getByText('by bob')).toBeTruthy()
  })

  it.each([{ data: { total_pages: 0, results: [] } }, { data: undefined }])(
    'says when there is none',
    async (answer) => {
      oauthApplicationReviews.mockResolvedValue(answer)

      render(await page())

      expect(screen.getByText('No apps.')).toBeTruthy()
      expect(screen.getByText('pages 0')).toBeTruthy()
    }
  )
})
