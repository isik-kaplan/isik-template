import type { FormErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { useApiSubmit } from './useApiSubmit'
import type { ApiSubmitOptions } from './useApiSubmit'
import { useFormState } from '@isikk/core/hooks'
import type { z } from 'zod'

type ApiResult = { data?: unknown; error?: unknown; response: Response }

/**
 * Form state, client-side validation, and the submit tail, as one object. The submit half is
 * `useApiSubmit`, composed rather than reimplemented - EmailsList's row actions (make primary,
 * resend verification, remove) are the same server-refusal handling with no form behind them, and
 * use it directly.
 */
export function useValidatedFormState<S extends z.ZodObject>(schema: S, initialState: z.infer<S>) {
  const form = useFormState<z.infer<S>>(initialState)
  const { isSubmitting, submit: submitToApi } = useApiSubmit()

  function validate(): boolean {
    const result = schema.safeParse(form.formState)
    if (result.success) {
      form.setFormErrors(undefined)
      return true
    }
    const { fieldErrors, formErrors } = result.error.flatten()
    form.setFormErrors({ ...fieldErrors, ...(formErrors.length ? { non_field_errors: formErrors } : {}) })
    return false
  }

  type SubmitOptions<T extends ApiResult> = Omit<ApiSubmitOptions<T>, 'setFormErrors'>

  /**
   * A server error naming a field this form doesn't render has nowhere to go, and silently
   * dropping it loses the only thing the server said. Those join non_field_errors, which every
   * form here shows.
   */
  function acceptServerErrors(errors: FormErrors) {
    const known = Object.keys(schema.shape)
    const mine: FormErrors = {}
    const orphaned: string[] = []
    for (const [field, messages] of Object.entries(errors)) {
      // Stryker disable next-line ConditionalExpression,StringLiteral: equivalent mutant. Losing
      // the "field === 'non_field_errors'" half of this check just moves a non_field_errors entry
      // into `orphaned` instead of `mine` directly - the recombination below puts its messages
      // back under mine.non_field_errors either way, in the same order.
      if (field === 'non_field_errors' || known.includes(field)) mine[field] = messages
      else orphaned.push(...messages)
    }
    if (orphaned.length > 0) mine.non_field_errors = [...(mine.non_field_errors ?? []), ...orphaned]
    // form.setFormErrors is typed against this call's concrete S, which a generic S can't be
    // checked against here - the shape (Record<string, string[]> plus non_field_errors) matches.
    ;(form.setFormErrors as (errors: FormErrors) => void)(mine)
  }

  /** Validates first, so a form never spends a round trip on something it could refuse itself. */
  async function submit<T extends ApiResult>(call: () => Promise<T>, options: SubmitOptions<T>): Promise<boolean> {
    if (!validate()) return false
    return submitToApi(call, { ...options, setFormErrors: acceptServerErrors })
  }

  return { ...form, validate, isSubmitting, submit }
}
