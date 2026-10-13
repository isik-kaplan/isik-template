import PeoplePage from '@/app/staff/people/page'

import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
            `${spec.name}(${spec.label}|${spec.anyLabel})=${spec.options.map((option) => option.label).join('/')}`
        )
        .join(' ')}
    </p>
  ),
}))
const ResourcePaginator = vi.fn(async ({ totalPages }: { totalPages: number }) => <p>pages {totalPages}</p>)
vi.mock('@/components/app/ResourcePaginator', () => ({
  ResourcePaginator: (props: { totalPages: number }) => ResourcePaginator(props),
}))
const me = vi.fn()
const users = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, users }) }))

const page = (asked: Record<string, string> = {}) => PeoplePage({ searchParams: Promise.resolve(asked) })

describe('PeoplePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue({ data: { is_staff: true, permissions: [] } })
    users.mockResolvedValue({
      data: {
        total_pages: 3,
        results: [
          { id: 'u1', username: 'alice', email: 'alice@x.test', is_active: true, is_staff: true, is_superuser: true },
          { id: 'u2', username: 'bob', email: 'bob@x.test', is_active: false, is_staff: false, is_superuser: false },
        ],
      },
    })
  })

  it.each([{ data: undefined }, { data: { is_staff: false, permissions: [] } }])(
    'is not found for somebody who does not read everybody',
    async (answer) => {
      me.mockResolvedValue(answer)

      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
      expect(users).not.toHaveBeenCalled()
    }
  )

  it('lists everybody with their standing, narrowed by the address bar, a page at a time', async () => {
    render(await page({ is_active: 'false', is_staff: 'nonsense', page: '2' }))

    expect(users).toHaveBeenCalledWith({ is_active: false, page: 2, page_size: 25 })
    expect(screen.getByRole('heading').textContent).toBe('People')
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(
      screen.getByText('filters is_active(Signing in|Any)=Active/Deactivated is_staff(Staff|Any)=Staff/Not staff')
    ).toBeTruthy()
    expect(screen.getByText('pages 3')).toBeTruthy()
    const alice = screen.getByRole('link', { name: 'alice' })
    expect(alice.getAttribute('href')).toBe('/staff/people/u1')
    const aliceRow = within(alice.closest('li') as HTMLElement)
    expect(aliceRow.getByText('alice@x.test')).toBeTruthy()
    expect(aliceRow.getByText('Superuser')).toBeTruthy()
    expect(aliceRow.getByText('Staff')).toBeTruthy()
    expect(aliceRow.queryByText('Deactivated')).toBeNull()
    const bobRow = within(screen.getByRole('link', { name: 'bob' }).closest('li') as HTMLElement)
    expect(bobRow.getByText('Deactivated')).toBeTruthy()
    expect(bobRow.queryByText('Staff')).toBeNull()
    expect(bobRow.queryByText('Superuser')).toBeNull()
  })

  it('lists for whoever may manage people without being staff', async () => {
    me.mockResolvedValue({ data: { is_staff: false, permissions: ['users:manage:user'] } })

    render(await page())

    expect(screen.getByRole('link', { name: 'alice' })).toBeTruthy()
  })

  it.each([{ data: { total_pages: 0, results: [] } }, { data: undefined }])(
    'says when there is nobody',
    async (answer) => {
      users.mockResolvedValue(answer)

      render(await page())

      expect(screen.getByText('Nobody here.')).toBeTruthy()
      expect(screen.getByText('pages 0')).toBeTruthy()
    }
  )
})
