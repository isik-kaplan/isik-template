import { useApiSubmit } from '@/lib/useApiSubmit'

import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const okResult = { data: { ok: true }, response: new Response(null, { status: 200 }) }

function failedResult(errors?: { code: string; param?: string; message: string }[]) {
  return { error: { status: 400, errors }, response: new Response(null, { status: 400 }) }
}

describe('useApiSubmit', () => {
  it('calls onSuccess and returns true when the default success check (truthy data) holds', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useApiSubmit())

    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.submit(async () => okResult, { failure: 'failed', onSuccess })
    })

    expect(returned).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith(okResult)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('toasts the given success message', async () => {
    const { result } = renderHook(() => useApiSubmit())

    await act(async () => {
      await result.current.submit(async () => okResult, { failure: 'failed', success: 'It worked.' })
    })

    expect(toast.success).toHaveBeenCalledWith('It worked.')
  })

  it('honors a custom isSuccess override', async () => {
    const notOk = { response: new Response(null, { status: 409 }) }
    const { result } = renderHook(() => useApiSubmit())

    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.submit(async () => notOk, {
        isSuccess: ({ response }) => response.status === 409,
        failure: 'failed',
      })
    })

    expect(returned).toBe(true)
  })

  it('tracks isSubmitting across the call', async () => {
    let resolveCall: (value: typeof okResult) => void = () => {}
    const call = () => new Promise<typeof okResult>((resolve) => (resolveCall = resolve))
    const { result } = renderHook(() => useApiSubmit())

    let submitPromise!: Promise<boolean>
    act(() => {
      submitPromise = result.current.submit(call, { failure: 'failed' })
    })
    expect(result.current.isSubmitting).toBe(true)

    await act(async () => {
      resolveCall(okResult)
      await submitPromise
    })
    expect(result.current.isSubmitting).toBe(false)
  })

  it('puts field errors on setFormErrors when given one, and does not toast', async () => {
    const setFormErrors = vi.fn()
    const errors = [{ code: 'required', param: 'email', message: 'Enter an email address.' }]
    const { result } = renderHook(() => useApiSubmit())

    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.submit(async () => failedResult(errors), { failure: 'failed', setFormErrors })
    })

    expect(returned).toBe(false)
    expect(setFormErrors).toHaveBeenCalledWith({ email: ['Enter an email address.'] })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('falls back setFormErrors to the failure message when the server sent no parseable errors', async () => {
    const setFormErrors = vi.fn()
    const { result } = renderHook(() => useApiSubmit())

    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.submit(async () => failedResult(undefined), {
        failure: 'Could not save.',
        setFormErrors,
      })
    })

    expect(returned).toBe(false)
    expect(setFormErrors).toHaveBeenCalledWith({ non_field_errors: ['Could not save.'] })
  })

  it('toasts the server message when there is no setFormErrors to put it in', async () => {
    const errors = [{ code: 'conflict', message: 'That email is already in use.' }]
    const { result } = renderHook(() => useApiSubmit())

    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.submit(async () => failedResult(errors), { failure: 'failed' })
    })

    expect(returned).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('That email is already in use.')
  })

  it('toasts the failure message when there is no setFormErrors and no parseable server message', async () => {
    const { result } = renderHook(() => useApiSubmit())

    await act(async () => {
      await result.current.submit(async () => failedResult(undefined), { failure: 'Could not save.' })
    })

    expect(toast.error).toHaveBeenCalledWith('Could not save.')
  })

  it('falls back to the failure message when the server sent an empty errors array', async () => {
    const { result } = renderHook(() => useApiSubmit())

    await act(async () => {
      await result.current.submit(async () => failedResult([]), { failure: 'Could not save.' })
    })

    expect(toast.error).toHaveBeenCalledWith('Could not save.')
  })
})
