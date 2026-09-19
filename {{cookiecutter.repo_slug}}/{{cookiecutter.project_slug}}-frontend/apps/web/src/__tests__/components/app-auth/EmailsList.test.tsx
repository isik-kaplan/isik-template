import type { ReactNode } from 'react'

import { EmailsList } from '@/components/app-auth/EmailsList'

import { fc, test } from '@fast-check/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Base UI's real Popover hangs jsdom the moment anything is awaited after opening it (confirmed:
// the identical AuthApi call with no Popover in the tree resolves in single-digit milliseconds).
// Rendering the menu content unconditionally here tests EmailsList's own conditionals and click
// handlers directly, without going anywhere near that mechanism.
vi.mock('@/components/app/Overlay', () => ({
  Overlay: ({ children }: { children: ReactNode }) => children,
  OverlayTrigger: ({ children }: { children: ReactNode }) => children,
  OverlayContent: ({ children }: { children: ReactNode }) => children,
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const primaryVerified = { email: 'jane@example.com', primary: true, verified: true }
const primaryUnverified = { email: 'jane@example.com', primary: true, verified: false }
const secondaryUnverified = { email: 'other@example.com', primary: false, verified: false }
const secondaryVerified = { email: 'verified@example.com', primary: false, verified: true }

describe('EmailsList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('renders every email with its primary/verified status', () => {
    render(<EmailsList initialEmails={[primaryVerified, secondaryUnverified]} />)

    expect(screen.getByText('jane@example.com')).toBeTruthy()
    expect(screen.getByText('other@example.com')).toBeTruthy()
    expect(screen.getAllByText('Primary')).toHaveLength(1)
    expect(screen.getByText('Unverified')).toBeTruthy()
  })

  it('shows the primary badge only for the primary email', () => {
    render(<EmailsList initialEmails={[primaryVerified, secondaryUnverified]} />)

    const [primaryRow, secondaryRow] = screen.getAllByRole('listitem')
    expect(within(primaryRow).getByText('Primary')).toBeTruthy()
    expect(within(secondaryRow).queryByText('Primary')).toBeNull()
  })

  it('shows a verified badge with the default variant for a verified email', () => {
    render(<EmailsList initialEmails={[primaryVerified]} />)

    expect(screen.getByText('Verified').className).toContain('bg-primary')
  })

  it('shows an unverified badge with the outline variant for an unverified email', () => {
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    expect(screen.getByText('Unverified').className).toContain('border-border')
  })

  it('labels the actions trigger for screen readers', () => {
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    expect(screen.getAllByRole('button', { name: 'Email actions' }).length).toBeGreaterThan(0)
  })

  it('shows a validation error when submitting the add-email form empty', async () => {
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.click(screen.getByRole('button', { name: 'Add email' }))

    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
  })

  it('disables the actions menu for an email with no available actions (primary and verified)', () => {
    render(<EmailsList initialEmails={[primaryVerified]} />)

    const [desktopTrigger] = within(screen.getByRole('listitem')).getAllByRole('button', { name: 'Email actions' })
    expect((desktopTrigger as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers all three actions for a non-primary, unverified email', () => {
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    const row = screen.getByRole('listitem')
    expect(within(row).getByRole('button', { name: 'Make primary' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Resend verification' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeTruthy()
  })

  it('disables Make primary for an unverified, non-primary email', () => {
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    const row = screen.getByRole('listitem')
    expect((within(row).getByRole('button', { name: 'Make primary' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Make primary, and hides Resend verification, for a non-primary verified email', () => {
    render(<EmailsList initialEmails={[secondaryVerified]} />)

    const row = screen.getByRole('listitem')
    expect((within(row).getByRole('button', { name: 'Make primary' }) as HTMLButtonElement).disabled).toBe(false)
    expect(within(row).queryByRole('button', { name: 'Resend verification' })).toBeNull()
  })

  it('hides Make primary and Remove for the primary email, but still offers Resend verification if unverified', () => {
    render(<EmailsList initialEmails={[primaryUnverified]} />)

    const row = screen.getByRole('listitem')
    expect(within(row).queryByRole('button', { name: 'Make primary' })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(within(row).getByRole('button', { name: 'Resend verification' })).toBeTruthy()
  })

  it('makes a non-primary email primary and updates the list from the response', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: [{ ...secondaryVerified, primary: true }] })
    )
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[secondaryVerified]} />)

    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Make primary' }))

    expect(toast.success).toHaveBeenCalledWith('Email set as primary.')
    expect(await screen.findByText('Primary')).toBeTruthy()
  })

  it('shows a toast error when making an email primary fails', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400, errors: [{ message: 'Nope.' }] }))
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[secondaryVerified]} />)

    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Make primary' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nope.'))
  })

  it('resends verification for an unverified email', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200 }))
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Resend verification' }))

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Verification email sent.'))
  })

  it('shows a toast error when resending verification fails', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400, errors: [{ message: 'Nope.' }] }))
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Resend verification' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nope.'))
  })

  it('removes a non-primary email and updates the list from the response', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, data: [] }))
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Remove' }))

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Email removed.'))
    expect(screen.queryByText('other@example.com')).toBeNull()
  })

  it('shows a toast error when removing an email fails', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400, errors: [{ message: 'Nope.' }] }))
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[secondaryUnverified]} />)

    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Remove' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nope.'))
  })

  it('adds a new email address and resets the form on success', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        status: 200,
        data: [primaryVerified, { email: 'new@example.com', primary: false, verified: false }],
      })
    )
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.type(screen.getByPlaceholderText('Email'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Add email' }))

    expect(toast.success).toHaveBeenCalledWith('Email added.')
    expect(await screen.findByText('new@example.com')).toBeTruthy()
    expect((screen.getByPlaceholderText('Email') as HTMLInputElement).value).toBe('')
  })

  it('shows an inline error when adding an email fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'email_taken', message: 'That email is already in use.' }] })
    )
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.type(screen.getByPlaceholderText('Email'), 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Add email' }))

    expect(await screen.findByText('That email is already in use.')).toBeTruthy()
  })

  it('shows a non-field error message when the email field itself has no errors', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'throttled', message: 'Try again later.' }] })
    )
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.type(screen.getByPlaceholderText('Email'), 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Add email' }))

    expect(await screen.findByText('Try again later.')).toBeTruthy()
  })

  it('joins multiple email-field error messages with a line break', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [
          { code: 'invalid', param: 'email', message: 'Enter a valid email address.' },
          { code: 'unique', param: 'email', message: 'That email is already in use.' },
        ],
      })
    )
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.type(screen.getByPlaceholderText('Email'), 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Add email' }))

    const errorText = await screen.findByText('Enter a valid email address.', { exact: false })
    expect(errorText.textContent).toBe('Enter a valid email address.\nThat email is already in use.')
  })

  it('joins multiple non-field error messages with a line break', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [
          { code: 'throttled', message: 'Try again later.' },
          { code: 'maintenance', message: 'The service is temporarily unavailable.' },
        ],
      })
    )
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.type(screen.getByPlaceholderText('Email'), 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Add email' }))

    const errorText = await screen.findByText('Try again later.', { exact: false })
    expect(errorText.textContent).toBe('Try again later.\nThe service is temporarily unavailable.')
  })

  it('falls back to a generic error message when adding an email fails with no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<EmailsList initialEmails={[primaryVerified]} />)

    await user.type(screen.getByPlaceholderText('Email'), 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Add email' }))

    expect(await screen.findByText('Could not add email.')).toBeTruthy()
  })

  test.prop([fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 })])(
    'renders every given email address verbatim, regardless of content',
    (emails) => {
      const { container } = render(
        <EmailsList initialEmails={emails.map((email) => ({ email, primary: false, verified: true }))} />
      )

      for (const email of emails) {
        expect(container.textContent).toContain(email)
      }
    }
  )
})
