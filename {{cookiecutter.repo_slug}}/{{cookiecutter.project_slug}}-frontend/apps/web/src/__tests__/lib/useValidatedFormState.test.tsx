import { useValidatedFormState } from '@/lib/useValidatedFormState'

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const schema = z
  .object({ password: z.string().min(1, 'Required.'), confirm: z.string().min(1, 'Required.') })
  .refine((data) => data.password === data.confirm, { message: 'Passwords must match.' })

describe('useValidatedFormState', () => {
  it('reports a field-level zod error without a non_field_errors entry', () => {
    const { result } = renderHook(() => useValidatedFormState(schema, { password: '', confirm: '' }))

    act(() => {
      expect(result.current.validate()).toBe(false)
    })

    expect(result.current.formErrors?.password).toEqual(['Required.'])
    expect(result.current.formErrors?.non_field_errors).toBeUndefined()
  })

  it('puts a root-level zod refinement error under non_field_errors', () => {
    const { result } = renderHook(() => useValidatedFormState(schema, { password: 'a', confirm: 'b' }))

    act(() => {
      expect(result.current.validate()).toBe(false)
    })

    expect(result.current.formErrors?.non_field_errors).toEqual(['Passwords must match.'])
  })

  it('clears errors and returns true once the form is valid', () => {
    const { result } = renderHook(() => useValidatedFormState(schema, { password: 'a', confirm: 'a' }))

    act(() => {
      result.current.validate()
    })

    expect(result.current.formErrors).toBeUndefined()
  })

  it('never calls the API when validation fails', async () => {
    const call = vi.fn()
    const { result } = renderHook(() => useValidatedFormState(schema, { password: '', confirm: '' }))

    await act(async () => {
      expect(await result.current.submit(call, { failure: 'failed' })).toBe(false)
    })

    expect(call).not.toHaveBeenCalled()
  })

  it('submits and reports success once validation passes', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useValidatedFormState(schema, { password: 'a', confirm: 'a' }))
    const okResult = { data: { ok: true }, response: new Response(null, { status: 200 }) }

    await act(async () => {
      expect(await result.current.submit(async () => okResult, { failure: 'failed', onSuccess })).toBe(true)
    })

    expect(onSuccess).toHaveBeenCalledWith(okResult)
  })

  function failedSubmit(errors: { code: string; param?: string; message: string }[]) {
    return { error: { status: 400, errors }, response: new Response(null, { status: 400 }) }
  }

  it('puts a server error naming a field the form renders under that field', async () => {
    const { result } = renderHook(() => useValidatedFormState(schema, { password: 'a', confirm: 'a' }))

    await act(async () => {
      await result.current.submit(async () => failedSubmit([{ code: 'x', param: 'password', message: 'Too weak.' }]), {
        failure: 'failed',
      })
    })

    expect(result.current.formErrors?.password).toEqual(['Too weak.'])
    expect(result.current.formErrors?.non_field_errors).toBeUndefined()
  })

  it('folds a server error naming a field this form does not render into non_field_errors', async () => {
    const { result } = renderHook(() => useValidatedFormState(schema, { password: 'a', confirm: 'a' }))

    await act(async () => {
      await result.current.submit(
        async () => failedSubmit([{ code: 'x', param: 'some_other_field', message: 'Orphaned.' }]),
        { failure: 'failed' }
      )
    })

    expect(result.current.formErrors?.non_field_errors).toEqual(['Orphaned.'])
  })

  it('merges an orphaned field error alongside a real non_field_errors message', async () => {
    const { result } = renderHook(() => useValidatedFormState(schema, { password: 'a', confirm: 'a' }))

    await act(async () => {
      await result.current.submit(
        async () =>
          failedSubmit([
            { code: 'x', message: 'Something about the whole form.' },
            { code: 'y', param: 'some_other_field', message: 'Orphaned.' },
          ]),
        { failure: 'failed' }
      )
    })

    expect(result.current.formErrors?.non_field_errors).toEqual(['Something about the whole form.', 'Orphaned.'])
  })
})
