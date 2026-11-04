import { ProfileDetails } from '@/components/app-auth/ProfileDetails'

import { NAME_TABLE } from '@/__tests__/support/names'
import type { NameRequirement } from '@/config/names'

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/apiOrigin', () => ({ apiOrigin: () => 'http://api.test-project.test' }))

const requirement = vi.hoisted(() => ({ current: 'username_with_optional_full' as NameRequirement }))
vi.mock('@/config/names', () => ({
  get NAME_REQUIREMENT() {
    return requirement.current
  },
}))

const USER = { username: 'jane', email: 'jane@test.test', first_name: 'Jane', last_name: '', etag: '"1"' }
const NO_HANDLE = { ...USER, username: null }

const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent

describe('ProfileDetails', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    requirement.current = 'username_with_optional_full'
  })

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
  it('leaves out the handle for somebody who has none', () => {
    render(<ProfileDetails user={NO_HANDLE} />)

    expect(screen.queryByText('Username')).toBeNull()
    expect(valueOf('Email')).toBe('jane@test.test')
  })

  describe.each(NAME_TABLE)('under %s', (name, offered) => {
    const asksFullName = offered.includes('first_name')

    beforeEach(() => {
      requirement.current = name
    })

    it(asksFullName ? 'shows the names' : 'shows no names, since none are asked for', () => {
      render(<ProfileDetails user={USER} />)

      expect(screen.queryByText('First name') !== null).toBe(asksFullName)
      expect(screen.queryByText('Last name') !== null).toBe(asksFullName)
      expect(valueOf('Username')).toBe('jane')
    })

    it(asksFullName ? 'offers Edit with a handle chosen' : 'offers no Edit once the handle is chosen', () => {
      render(<ProfileDetails user={USER} />)

      expect(screen.queryByRole('button', { name: 'Edit' }) !== null).toBe(asksFullName)
    })

    it(offered.includes('username') ? 'offers Edit to choose a handle' : 'offers Edit for the names alone', () => {
      render(<ProfileDetails user={NO_HANDLE} />)

      expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    })
  })
})
