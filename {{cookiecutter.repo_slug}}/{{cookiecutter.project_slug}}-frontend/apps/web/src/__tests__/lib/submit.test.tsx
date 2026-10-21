import { useAPISubmit, useAuthAPISubmit } from '@/lib/submit'

import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function refusal(body: unknown) {
  return { error: body, response: new Response(null, { status: 403 }) }
}

describe('the submit hooks', () => {
  it('report through the app toast and read a DRF refusal on the main API', async () => {
    const { result } = renderHook(() => useAPISubmit())

    await act(async () => {
      await result.current.submit(async () => refusal({ detail: 'Not yours.' }), { failure: 'failed' })
    })

    expect(toast.error).toHaveBeenCalledWith('Not yours.')
  })

  it("read allauth's refusal on the auth API", async () => {
    const { result } = renderHook(() => useAuthAPISubmit())

    await act(async () => {
      await result.current.submit(async () => refusal({ status: 403, errors: [{ code: 'x', message: 'No.' }] }), {
        failure: 'failed',
      })
    })

    expect(toast.error).toHaveBeenCalledWith('No.')
  })

  it('say how long to wait when the API refused for coming too often, whatever its body', async () => {
    const { result } = renderHook(() => useAPISubmit())

    await act(async () => {
      await result.current.submit(
        async () => ({
          error: { detail: 'Request was throttled. Expected available in 7 seconds.' },
          response: new Response(null, { status: 429, headers: { 'Retry-After': '7' } }),
        }),
        { failure: 'failed' }
      )
    })

    expect(toast.error).toHaveBeenLastCalledWith('Too many requests. Try again in 7 seconds.')
  })

  it("say to wait a moment on allauth's refusal, which never says how long", async () => {
    const { result } = renderHook(() => useAuthAPISubmit())

    await act(async () => {
      await result.current.submit(
        async () => ({ error: { status: 429 }, response: new Response(null, { status: 429 }) }),
        { failure: 'failed' }
      )
    })

    expect(toast.error).toHaveBeenLastCalledWith('Too many requests. Wait a moment, then try again.')
  })

  it("say to wait a moment, in the app's own words, when the API's refusal does not say how long", async () => {
    const { result } = renderHook(() => useAPISubmit())

    await act(async () => {
      await result.current.submit(async () => ({ error: {}, response: new Response(null, { status: 429 }) }), {
        failure: 'failed',
      })
    })

    expect(toast.error).toHaveBeenLastCalledWith('Too many requests. Wait a moment, then try again.')
  })
})
