import { useEmailRowActions } from '@/lib/useEmailRowActions'

import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const t = (key: string) => key

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('useEmailRowActions', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('makePrimary updates the list and toasts on success', async () => {
    const updated = [{ email: 'a@test.test', primary: true, verified: true }]
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, data: updated }))
    const setEmails = vi.fn()
    const { result } = renderHook(() => useEmailRowActions(t, setEmails))

    await act(async () => {
      await result.current.makePrimary('a@test.test')
    })

    expect(setEmails).toHaveBeenCalledWith(updated)
    expect(toast.success).toHaveBeenCalledWith('auth:profileEmailMadePrimary')
  })

  it('makePrimary toasts the server error on failure', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'x', message: 'Cannot make primary.' }] })
    )
    const setEmails = vi.fn()
    const { result } = renderHook(() => useEmailRowActions(t, setEmails))

    await act(async () => {
      await result.current.makePrimary('a@test.test')
    })

    expect(setEmails).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Cannot make primary.')
  })

  it('makePrimary falls back to its own error message when the server sent no parseable one', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const { result } = renderHook(() => useEmailRowActions(t, vi.fn()))

    await act(async () => {
      await result.current.makePrimary('a@test.test')
    })

    expect(toast.error).toHaveBeenCalledWith('auth:profileEmailMakePrimaryError')
  })

  it('resendVerification succeeds on a response with no error, despite no data', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, {}))
    const setEmails = vi.fn()
    const { result } = renderHook(() => useEmailRowActions(t, setEmails))

    await act(async () => {
      await result.current.resendVerification('a@test.test')
    })

    expect(toast.success).toHaveBeenCalledWith('auth:profileEmailVerificationResent')
  })

  it('resendVerification toasts the failure message on error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'x', message: 'Cannot resend.' }] })
    )
    const setEmails = vi.fn()
    const { result } = renderHook(() => useEmailRowActions(t, setEmails))

    await act(async () => {
      await result.current.resendVerification('a@test.test')
    })

    expect(toast.error).toHaveBeenCalledWith('Cannot resend.')
  })

  it('resendVerification falls back to its own error message when the server sent no parseable one', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const { result } = renderHook(() => useEmailRowActions(t, vi.fn()))

    await act(async () => {
      await result.current.resendVerification('a@test.test')
    })

    expect(toast.error).toHaveBeenCalledWith('auth:profileEmailResendError')
  })

  it('remove updates the list and toasts on success', async () => {
    const updated: unknown[] = []
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, data: updated }))
    const setEmails = vi.fn()
    const { result } = renderHook(() => useEmailRowActions(t, setEmails))

    await act(async () => {
      await result.current.remove('a@test.test')
    })

    expect(setEmails).toHaveBeenCalledWith(updated)
    expect(toast.success).toHaveBeenCalledWith('auth:profileEmailRemoved')
  })

  it('remove toasts the failure message on error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'x', message: 'Cannot remove.' }] })
    )
    const setEmails = vi.fn()
    const { result } = renderHook(() => useEmailRowActions(t, setEmails))

    await act(async () => {
      await result.current.remove('a@test.test')
    })

    expect(toast.error).toHaveBeenCalledWith('Cannot remove.')
  })

  it('remove falls back to its own error message when the server sent no parseable one', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const { result } = renderHook(() => useEmailRowActions(t, vi.fn()))

    await act(async () => {
      await result.current.remove('a@test.test')
    })

    expect(toast.error).toHaveBeenCalledWith('auth:profileEmailRemoveError')
  })
})
