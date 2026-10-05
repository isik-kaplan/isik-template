import { RecoveryCodesSection } from '@/components/app-auth/RecoveryCodesSection'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('RecoveryCodesSection', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'csrftoken=test-token'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('says how many codes are left', () => {
    render(<RecoveryCodesSection unused={7} total={10} />)

    expect(screen.getByText('7 of 10 codes left.')).toBeTruthy()
  })

  it('shows the fresh set once it is generated, and refreshes the count', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { type: 'recovery_codes', unused_codes: ['aaaa', 'bbbb'] } })
    )
    const user = userEvent.setup()
    render(<RecoveryCodesSection unused={1} total={10} />)

    await user.click(screen.getByRole('button', { name: 'Generate new codes' }))

    const [request] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/browser/v1/account/authenticators/recovery-codes')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['aaaa', 'bbbb'])
    expect(toast.success).toHaveBeenCalledWith('New recovery codes generated. The old ones no longer work.')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows nothing new and leaves the page alone when generating fails', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {}))
    const user = userEvent.setup()
    render(<RecoveryCodesSection unused={1} total={10} />)

    await user.click(screen.getByRole('button', { name: 'Generate new codes' }))

    expect(screen.queryByRole('listitem')).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('Could not generate new recovery codes.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('heads its section by name', () => {
    render(<RecoveryCodesSection unused={7} total={10} />)

    expect(screen.getByRole('heading', { name: 'Recovery codes' })).toBeTruthy()
  })
})
