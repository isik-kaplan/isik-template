'use client'

import { needsReauthentication } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { provePath } from './reauthentication'
import { useAuthAPISubmit } from './submit'
import type { APIResult, APISubmitOptions, SubmitOutcome } from '@isikk/core/hooks'
import { toast } from 'sonner'

export type FactorSubmitOptions<T extends APIResult> = Pick<APISubmitOptions<T>, 'success' | 'failure'> & {
  onSuccess?: (result: T, outcome: SubmitOutcome) => void
  // Where a refusal of the input goes; a toast unless the caller has a field to show it beside.
  onFailure?: (message: string) => void
}

/** useAuthAPISubmit for second-factor changes, whose "prove it is you" 401 goes to the prove page. */
export function useFactorSubmit() {
  const { isSubmitting, submit } = useAuthAPISubmit()

  /** Resolves to the response body on success and null otherwise, so a multi-step flow reads in order. */
  async function submitFactorChange<T extends APIResult>(
    call: () => Promise<T>,
    { success, failure, onSuccess, onFailure = (message) => toast.error(message) }: FactorSubmitOptions<T>
  ): Promise<NonNullable<T['data']> | null> {
    let answered: T | undefined
    const succeeded = await submit(async () => (answered = await call()), {
      success,
      failure,
      isSuccess: ({ data }) => Boolean(data),
      setFormErrors: (errors) => onFailure(Object.values(errors)[0][0]),
      // Asked for a proof is a detour rather than a failure: no complaint, just the way to give one.
      onRefusal: ({ error }) => {
        if (!needsReauthentication(error)) return false
        window.location.href = provePath(`${window.location.pathname}${window.location.search}`)
        return true
      },
      onSuccess,
    })
    return succeeded ? ((answered as T).data as NonNullable<T['data']>) : null
  }

  return { isSubmitting, submit: submitFactorChange }
}
