'use client'

import { tooManyRequestsMessage } from './tooManyRequestsMessage'
import { allauthEnvelope } from '@isikk/core/allauth'
import { createSubmitHooks } from '@isikk/core/hooks'
import { toast } from 'sonner'

// Called when a refusal is reported rather than once here, so it is in the language the page is in by then.
const throttled = tooManyRequestsMessage

/** The submit hooks for the main API, which is DRF and answers in the shape the library reads by default. */
export const { useAPISubmit, useValidatedFormState } = createSubmitHooks(toast, { throttled })

/** The same pair, reading allauth's refusals - its headless API answers in its own shape, not DRF's. */
export const { useAPISubmit: useAuthAPISubmit, useValidatedFormState: useAuthValidatedFormState } = createSubmitHooks(
  toast,
  { envelope: allauthEnvelope, throttled }
)
