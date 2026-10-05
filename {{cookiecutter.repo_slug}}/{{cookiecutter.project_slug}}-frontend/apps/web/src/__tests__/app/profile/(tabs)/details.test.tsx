import ProfileDetailsPage from '@/app/profile/(tabs)/details/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ requireSession: () => requireSession(), getLanguage: async () => 'en' }))
const me = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me }) }))
const AccountHistory = vi.fn((_props: object) => <p>history</p>)
vi.mock('@/components/app-auth/AccountHistory', () => ({ AccountHistory: (props: object) => AccountHistory(props) }))

const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent

describe('ProfileDetailsPage', () => {
  beforeEach(() => {
    requireSession.mockResolvedValue({ user: { id: 'u1', username: 'jane', email: 'jane@test.test' } })
  })

  it("renders the visitor's details from the API, and their history narrowed by the address bar", async () => {
    me.mockResolvedValue({
      data: { id: 'u1', username: 'jane', email: 'jane@test.test', first_name: 'Jane', last_name: 'Doe' },
    })

    render(await ProfileDetailsPage({ searchParams: Promise.resolve({ action: 'update' }) }))

    expect(valueOf('Username')).toBe('jane')
    expect(valueOf('First name')).toBe('Jane')
    expect(valueOf('Last name')).toBe('Doe')
    expect(screen.getByText('history')).toBeTruthy()
    expect(AccountHistory).toHaveBeenCalledWith({ userId: 'u1', asked: { action: 'update' } })
  })

  it("falls back to the session's own details, names unset, when the API cannot answer", async () => {
    me.mockResolvedValue({ data: undefined })

    render(await ProfileDetailsPage({ searchParams: Promise.resolve({}) }))

    expect(valueOf('Username')).toBe('jane')
    expect(valueOf('Email')).toBe('jane@test.test')
    expect(valueOf('First name')).toBe('Not set')
    expect(valueOf('Last name')).toBe('Not set')
  })
})
