import { ProveContent } from '@/components/app-auth/ProveContent'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))

const props = {
  next: '/profile',
  providerAction: 'https://auth.example.test/prove',
  callbackUrl: 'https://example.test/p',
}

describe('ProveContent', () => {
  it('offers a password, each provider that can prove it, and the way back by email, in that order', () => {
    const providers = [
      { id: 'authentik', name: 'Authentik' },
      { id: 'okta', name: 'Okta' },
    ]
    const flows = [
      { id: 'reauthenticate' },
      { id: 'provider_reauthenticate', providers },
      { id: 'set_password_by_email', email: 'alice@example.test' },
    ]
    render(<ProveContent {...props} flows={flows} />)

    expect(screen.getByLabelText('Password')).toBeTruthy()
    // The password field's show/hide toggle is an icon button with no text of its own.
    const labelled = screen.getAllByRole('button').filter((button) => button.textContent)
    expect(labelled.map((button) => button.textContent)).toEqual([
      'Confirm',
      'Confirm with Authentik',
      'Confirm with Okta',
      'Email me a link to set a password',
    ])
  })

  it('offers no provider button for a provider flow that names none', () => {
    render(<ProveContent {...props} flows={[{ id: 'provider_reauthenticate' }]} />)

    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('offers the second factor as a way to prove it, in boxes for the authenticator code', () => {
    render(<ProveContent {...props} flows={[{ id: 'mfa_reauthenticate', types: ['totp'] }]} />)

    expect(screen.getByLabelText('Digit 1 of 6')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy()
  })

  it('offers a recovery code for a second factor flow that names no types', () => {
    render(<ProveContent {...props} flows={[{ id: 'mfa_reauthenticate' }]} />)

    expect(screen.getByLabelText('Recovery code')).toBeTruthy()
  })

  it('leaves out a flow it does not know rather than breaking', () => {
    render(<ProveContent {...props} flows={[{ id: 'something_new' }]} />)

    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryByText("There is no way to confirm it's you on this account. Contact support.")).toBeNull()
  })

  it('says so when there is no way to prove it at all', () => {
    render(<ProveContent {...props} flows={[]} />)

    expect(screen.getByText("There is no way to confirm it's you on this account. Contact support.")).toBeTruthy()
  })

  it('shows no error unless a provider round trip failed', () => {
    const { rerender } = render(<ProveContent {...props} flows={[]} />)
    expect(screen.queryByText('We could not confirm it was you. Try again.')).toBeNull()

    rerender(<ProveContent {...props} flows={[]} error="cancelled" />)

    expect(screen.getByText('We could not confirm it was you. Try again.')).toBeTruthy()
  })
})
