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
})
