'use client'

import { useState } from 'react'

import { extractAuthErrors, toFormErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'
import type { FormErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { toast } from 'sonner'

type ApiResult = { data?: unknown; error?: unknown; response: Response }

export type ApiSubmitOptions<T extends ApiResult> = {
  // Default: a truthy `data`. Override for an endpoint whose success is a non-2xx status with no
  // error body - allauth's mandatory-email-verification and already-logged-in flows both do this.
  isSuccess?: (result: T) => boolean
  // Silence on success is the default every form already used - toast only where the change
  // happens somewhere the caller can't see for itself (ChangePasswordForm, EmailsList's actions).
  success?: string
  failure: string
  // Given, a 400's field errors render beside the inputs that caused them and nothing is toasted -
  // what every form here does. Without one, a failure always toasts - what a bare button click
  // (no fields to point at) does instead.
  setFormErrors?: (errors: FormErrors) => void
  onSuccess?: (result: T) => void
}

/**
 * The tail every submit handler in this app had copied by hand: submitting flag, the call, and
 * putting the server's answer (or refusal) wherever the caller said it goes.
 */
export function useApiSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit<T extends ApiResult>(call: () => Promise<T>, options: ApiSubmitOptions<T>): Promise<boolean> {
    setIsSubmitting(true)
    const result = await call()
    setIsSubmitting(false)

    const succeeded = options.isSuccess ? options.isSuccess(result) : Boolean(result.data)
    if (succeeded) {
      if (options.success) toast.success(options.success)
      options.onSuccess?.(result)
      return true
    }

    const authErrors = extractAuthErrors(result.error)
    if (options.setFormErrors) {
      options.setFormErrors(toFormErrors(authErrors) ?? { non_field_errors: [options.failure] })
      return false
    }

    toast.error(authErrors?.[0]?.message ?? options.failure)
    return false
  }

  return { isSubmitting, submit }
}
