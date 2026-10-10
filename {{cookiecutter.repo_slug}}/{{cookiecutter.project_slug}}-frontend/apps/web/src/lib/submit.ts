'use client'

import { allauthEnvelope } from '@isikk/core/allauth'
import { createSubmitHooks } from '@isikk/core/hooks'
import { toast } from 'sonner'

/** The submit hooks for the main API, which is DRF and answers in the shape the library reads by default. */
export const { useAPISubmit, useValidatedFormState } = createSubmitHooks(toast)

/** The same pair, reading allauth's refusals - its headless API answers in its own shape, not DRF's. */
export const { useAPISubmit: useAuthAPISubmit, useValidatedFormState: useAuthValidatedFormState } = createSubmitHooks(
  toast,
  allauthEnvelope
)
