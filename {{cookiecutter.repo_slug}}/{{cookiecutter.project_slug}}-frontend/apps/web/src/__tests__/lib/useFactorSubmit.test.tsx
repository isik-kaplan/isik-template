import { useFactorSubmit } from '@/lib/useFactorSubmit'

import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ok = { response: new Response(null, { status: 200 }) }

function refused(status: number, error: unknown) {
  return { data: undefined, error, response: new Response(null, { status }) }
}

describe('useFactorSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves to the body on success, toasting the success message', async () => {
    const { result } = renderHook(() => useFactorSubmit())
    let answer: unknown
    await act(async () => {
      answer = await result.current.submit(async () => ({ ...ok, data: { status: 200 } }), {
        success: 'Done.',
        failure: 'Failed.',
      })
    })

    expect(answer).toEqual({ status: 200 })
    expect(toast.success).toHaveBeenCalledWith('Done.')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("toasts the server's own reason on a refusal and resolves to null", async () => {
    const { result } = renderHook(() => useFactorSubmit())
    let answer: unknown = 'unset'
    await act(async () => {
      answer = await result.current.submit(
        async () => refused(400, { errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }] }),
        { failure: 'Failed.' }
      )
    })

    expect(answer).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('Incorrect code.')
  })

  it('falls back to the failure message when the refusal says nothing', async () => {
    const { result } = renderHook(() => useFactorSubmit())
    await act(async () => {
      await result.current.submit(async () => refused(500, undefined), { failure: 'Failed.' })
    })

    expect(toast.error).toHaveBeenCalledWith('Failed.')
  })

  it('sends a refusal asking for a proof to the prove page, and back here afterwards', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/profile/two-factor', search: '?tab=1' },
      writable: true,
    })
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useFactorSubmit())
    let answer: unknown = 'unset'
    await act(async () => {
      answer = await result.current.submit(
        async () => refused(401, { data: { flows: [{ id: 'reauthenticate' }] }, meta: { is_authenticated: true } }),
        { success: 'Done.', failure: 'Failed.', onSuccess }
      )
    })

    const sentTo = window.location.href
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
    expect(sentTo).toBe('/auth/prove?next=%2Fprofile%2Ftwo-factor%3Ftab%3D1')
    expect(answer).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('hands a success to onSuccess, and stays quiet without a success message', async () => {
    const onSuccess = vi.fn()
    const answered = { ...ok, data: { status: 200 } }
    const { result } = renderHook(() => useFactorSubmit())
    await act(async () => {
      await result.current.submit(async () => answered, { failure: 'Failed.', onSuccess })
    })

    expect(onSuccess).toHaveBeenCalledWith(answered, { replayed: false })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('counts an answer with no body as a failure', async () => {
    const { result } = renderHook(() => useFactorSubmit())
    let answer: unknown = 'unset'
    await act(async () => {
      answer = await result.current.submit(async () => ok, { failure: 'Failed.' })
    })

    expect(answer).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('Failed.')
  })

  it('hands the refusal to onFailure instead of toasting, when given one', async () => {
    const onFailure = vi.fn()
    const { result } = renderHook(() => useFactorSubmit())
    await act(async () => {
      await result.current.submit(
        async () => refused(400, { errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }] }),
        { failure: 'Failed.', onFailure }
      )
    })

    expect(onFailure).toHaveBeenCalledWith('Incorrect code.')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('reports submitting while the call is in flight', async () => {
    let finish: (value: unknown) => void = () => {}
    const { result } = renderHook(() => useFactorSubmit())
    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = result.current.submit(
        () => new Promise((resolve) => (finish = resolve)).then(() => ({ ...ok, data: {} })),
        { failure: 'Failed.' }
      )
    })

    expect(result.current.isSubmitting).toBe(true)
    await act(async () => {
      finish(undefined)
      await pending
    })
    expect(result.current.isSubmitting).toBe(false)
  })
})
