'use client'

import { needsReauthentication } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { provePath } from './reauthentication'
import { useAuthAPISubmit } from './submit'
import type { APIResult, APISubmitOptions } from '@isikk/core/hooks'
import { toast } from 'sonner'

export type FactorSubmitOptions<T extends APIResult> = Pick<
  APISubmitOptions<T>,
  'success' | 'failure' | 'onSuccess'
> & {
  // Where a refusal of the input goes; a toast unless the caller has a field to show it beside.
  onFailure?: (message: string) => void
}

/**
 * useAuthAPISubmit for the calls that change a second factor. Each asks the person to prove it is them
 * first, and is refused with a 401 offering the ways to - which would otherwise read as the generic
 * failure. That refusal goes to the prove page instead, which comes back here once they have.
 */
export function useFactorSubmit() {
  const { isSubmitting, submit } = useAuthAPISubmit()

  /** Resolves to the response body on success and null otherwise, so a multi-step flow reads in order. */
  async function submitFactorChange<T extends APIResult>(
    call: () => Promise<T>,
    { success, failure, onSuccess, onFailure = (message) => toast.error(message) }: FactorSubmitOptions<T>
  ): Promise<NonNullable<T['data']> | null> {
    let answered: T | undefined
    const succeeded = await submit(async () => (answered = await call()), {
      failure,
      // Asked for a proof is a detour rather than a failure: no complaint, just the way to give one.
      isSuccess: ({ data, error }) => Boolean(data) || needsReauthentication(error),
      setFormErrors: (errors) => onFailure(Object.values(errors)[0][0]),
      onSuccess: (result, outcome) => {
        if (needsReauthentication(result.error)) {
          window.location.href = provePath(`${window.location.pathname}${window.location.search}`)
          return
        }
        if (success) toast.success(success)
        onSuccess?.(result, outcome)
      },
    })
    return succeeded && !needsReauthentication((answered as T).error)
      ? ((answered as T).data as NonNullable<T['data']>)
      : null
  }

  return { isSubmitting, submit: submitFactorChange }
}
