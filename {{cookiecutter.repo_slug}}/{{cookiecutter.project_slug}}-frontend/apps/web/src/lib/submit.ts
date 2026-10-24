'use client'

import { i18next } from '@/i18n/client'

import { tooManyRequestsMessage } from './tooManyRequestsMessage'
import { allauthEnvelope } from '@isikk/core/allauth'
import { createSubmitHooks } from '@isikk/core/hooks'
import { toast } from 'sonner'

// Called per refusal, so it is in the page's language at that moment.
const throttled = tooManyRequestsMessage
const stale = () => i18next.t('common:staleChanged')

/** Submit hooks for the main API, whose DRF errors (412 included) are the library's default shape. */
export const { useAPISubmit, useValidatedFormState, useVersionedFormState } = createSubmitHooks(toast, {
  throttled,
  stale,
})

/** The same pair for allauth's headless error shape. */
export const { useAPISubmit: useAuthAPISubmit, useValidatedFormState: useAuthValidatedFormState } = createSubmitHooks(
  toast,
  { envelope: allauthEnvelope, throttled }
)
