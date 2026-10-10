'use client'

import type { Translate } from '@/i18n/config'

import { createAuthApi } from './apiClients'
import { authOrigin } from './authOrigin'
import { useAuthAPISubmit } from './submit'

export type EmailAddress = { email: string; primary: boolean; verified: boolean }

/** EmailsList's three row actions (make primary, resend verification, remove), pulled out of the
 * component so they're unit-testable on their own - EmailsList.test.tsx can't reach them: opening
 * its Popover-based menu and then awaiting anything hangs under jsdom. */
export function useEmailRowActions(t: Translate, setEmails: (emails: EmailAddress[]) => void) {
  const { submit } = useAuthAPISubmit()

  async function makePrimary(email: string) {
    await submit(() => createAuthApi(authOrigin()).makeEmailPrimary(email), {
      success: t('auth:profileEmailMadePrimary'),
      failure: t('auth:profileEmailMakePrimaryError'),
      onSuccess: ({ data }) => setEmails(data!.data as EmailAddress[]),
    })
  }

  async function resendVerification(email: string) {
    await submit(() => createAuthApi(authOrigin()).resendEmailVerification(email), {
      success: t('auth:profileEmailVerificationResent'),
      failure: t('auth:profileEmailResendError'),
    })
  }

  async function remove(email: string) {
    await submit(() => createAuthApi(authOrigin()).removeEmail(email), {
      success: t('auth:profileEmailRemoved'),
      failure: t('auth:profileEmailRemoveError'),
      onSuccess: ({ data }) => setEmails(data!.data as EmailAddress[]),
    })
  }

  return { makePrimary, resendVerification, remove }
}
