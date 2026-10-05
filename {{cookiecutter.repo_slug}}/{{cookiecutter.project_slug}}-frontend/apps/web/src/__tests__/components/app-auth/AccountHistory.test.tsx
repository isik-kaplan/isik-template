import { AccountHistory } from '@/components/app-auth/AccountHistory'
import { LISTING_PAGE_SIZE } from '@/components/app/Filters/paging'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/profile/details',
  useSearchParams: () => new URLSearchParams(),
}))
const userHistory = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ userHistory }) }))

function event(id: number, action: 'insert' | 'update', changes: Record<string, unknown> | null) {
  return { event_id: id, action, changes, event_created_at: '2026-10-05T09:30:00Z' }
}

function answer(...results: ReturnType<typeof event>[]) {
  userHistory.mockResolvedValue({ data: { total_pages: 1, results } })
}

describe('AccountHistory', () => {
  beforeEach(() => {
    userHistory.mockReset()
  })

  it('lists what happened, newest first as the API answers, naming the fields an update changed', async () => {
    answer(event(2, 'update', { first_name: ['', 'Jane'], updated_at: ['a', 'b'] }), event(1, 'insert', null))

    render(await AccountHistory({ userId: 'u1', asked: {} }))

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('span')?.textContent)).toEqual(['Account updated', 'Account created'])
    expect(rows[0].textContent).toContain('First name')
    expect(rows[0].textContent).not.toContain('updated_at')
    expect(rows[1].textContent).not.toContain('First name')
    const time = rows[0].querySelector('time')
    expect(time?.getAttribute('datetime')).toBe('2026-10-05T09:30:00Z')
    expect(time?.textContent).toBe('Oct 5, 2026, 9:30 AM')
    expect(screen.getByRole('heading', { name: 'Account history' })).toBeTruthy()
  })

  it('joins the fields an update changed into one line', async () => {
    answer(event(4, 'update', { first_name: ['', 'A'], last_name: ['', 'B'] }))

    render(await AccountHistory({ userId: 'u1', asked: {} }))

    expect(screen.getByText('First name, Last name')).toBeTruthy()
  })

  it('names no fields for the creation, whatever it recorded', async () => {
    answer(event(1, 'insert', { username: [null, 'jane'] }))

    render(await AccountHistory({ userId: 'u1', asked: {} }))

    expect(screen.getByRole('listitem').querySelectorAll('span')).toHaveLength(1)
  })

  it('says nothing about fields for an update that changed only bookkeeping', async () => {
    answer(event(3, 'update', { updated_at: ['a', 'b'] }))

    render(await AccountHistory({ userId: 'u1', asked: {} }))

    expect(screen.getByRole('listitem').querySelectorAll('span')).toHaveLength(1)
  })

  it('asks for its own page of its own history, narrowed by the declared filter only', async () => {
    userHistory.mockResolvedValue({ data: { total_pages: 3, results: [] } })

    render(await AccountHistory({ userId: 'u1', asked: { action: 'update', page: '2', actor: 'someone' } }))

    expect(userHistory).toHaveBeenCalledExactlyOnceWith('u1', {
      action: 'update',
      page: 2,
      page_size: LISTING_PAGE_SIZE,
    })
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
  })

  it('offers created and updated to filter by, never deleted', async () => {
    answer()

    render(await AccountHistory({ userId: 'u1', asked: {} }))

    const select = screen.getByLabelText('Change') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => [option.value, option.text])).toEqual([
      ['any', 'All changes'],
      ['insert', 'Account created'],
      ['update', 'Account updated'],
    ])
  })

  it('reads an unanswered request as nothing to show, with no pages', async () => {
    userHistory.mockResolvedValue({ data: undefined })

    render(await AccountHistory({ userId: 'u1', asked: { page: '9' } }))

    expect(screen.getByText('Nothing to show yet.')).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
