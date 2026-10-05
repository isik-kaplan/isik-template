'use client'

import { needsReauthentication } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { provePath } from './reauthentication'
import { useApiSubmit } from './useApiSubmit'
import type { ApiSubmitOptions } from './useApiSubmit'
import { toast } from 'sonner'

type ApiResult = { data?: unknown; error?: unknown; response: Response }

export type FactorSubmitOptions<T extends ApiResult> = Omit<ApiSubmitOptions<T>, 'setFormErrors'> & {
  // Where the refusal goes; a toast unless the caller has a field to show it beside.
  onFailure?: (message: string) => void
}

/**
 * useApiSubmit for the calls that change a second factor. Each asks the person to prove it is them
 * first, and is refused with a 401 offering the ways to - which would otherwise read as the generic
 * failure. That refusal goes to the prove page instead, which comes back here once they have.
 */
export function useFactorSubmit() {
  const { isSubmitting, submit } = useApiSubmit()

  /** Resolves to the response body on success and null otherwise, so a multi-step flow reads in order. */
  async function submitFactorChange<T extends ApiResult>(
    call: () => Promise<T>,
    { onFailure = (message) => toast.error(message), ...options }: FactorSubmitOptions<T>
  ): Promise<NonNullable<T['data']> | null> {
    let result: T | undefined
    let reauthenticate: boolean
    const succeeded = await submit(
      async () => {
        result = await call()
        reauthenticate = needsReauthentication(result.error)
        return result
      },
      {
        ...options,
        setFormErrors: (errors) => {
          if (reauthenticate) {
            window.location.href = provePath(`${window.location.pathname}${window.location.search}`)
            return
          }
          onFailure(Object.values(errors)[0][0])
        },
      }
    )
    return succeeded ? ((result as T).data as NonNullable<T['data']>) : null
  }

  return { isSubmitting, submit: submitFactorChange }
}
