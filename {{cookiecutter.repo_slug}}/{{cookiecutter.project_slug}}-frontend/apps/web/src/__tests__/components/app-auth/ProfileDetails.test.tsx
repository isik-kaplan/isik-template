import { ProfileDetails } from '@/components/app-auth/ProfileDetails'

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/apiOrigin', () => ({ apiOrigin: () => 'http://api.test-project.test' }))

const USER = { username: 'jane', email: 'jane@test.test', first_name: 'Jane', last_name: '' }

const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent

describe('ProfileDetails', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('opens read-only, with an unset name said so rather than left blank', () => {
    render(<ProfileDetails user={USER} />)

    expect(valueOf('Username')).toBe('jane')
    expect(valueOf('Email')).toBe('jane@test.test')
    expect(valueOf('First name')).toBe('Jane')
    expect(valueOf('Last name')).toBe('Not set')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows the form on Edit and the saved names once it saves', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ ...USER, first_name: 'Janet', last_name: 'Doe' })
    ) as unknown as typeof fetch
    render(<ProfileDetails user={USER} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Janet' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(valueOf('First name')).toBe('Janet')
    expect(valueOf('Last name')).toBe('Doe')
  })

  it('throws away an abandoned edit on Cancel', () => {
    render(<ProfileDetails user={USER} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Mallory' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(valueOf('First name')).toBe('Jane')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Jane')
  })
})
