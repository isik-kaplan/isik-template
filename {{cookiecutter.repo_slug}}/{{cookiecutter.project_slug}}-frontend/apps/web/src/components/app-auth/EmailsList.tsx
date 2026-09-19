'use client'

import { useMemo, useState } from 'react'

import { MoreHorizontalIcon } from 'lucide-react'

import { Overlay, OverlayContent, OverlayTrigger } from '@/components/app/Overlay'
import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'
import type { EmailAddress } from '@/lib/useEmailRowActions'
import { useEmailRowActions } from '@/lib/useEmailRowActions'
import { useValidatedFormState } from '@/lib/useValidatedFormState'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { z } from 'zod'

export type EmailsListProps = {
  initialEmails: EmailAddress[]
}

export function EmailsList({ initialEmails }: EmailsListProps) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  // Stryker disable next-line ArrayDeclaration: equivalent mutant. t's reference never
  // changes across renders in this single-language app, so this memo never actually
  // recomputes either way.
  const addEmailSchema = useMemo(() => z.object({ email: z.email(t('auth:validationEmailInvalid')) }), [t])
  const [emails, setEmails] = useState(initialEmails)
  const { formState, handleFormStateEvent, formErrors, isSubmitting, submit, resetFormState } = useValidatedFormState(
    addEmailSchema,
    { email: '' }
  )
  const { makePrimary, resendVerification, remove } = useEmailRowActions(t, setEmails)

  async function handleAddEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await submit(() => new AuthApi(authOrigin()).addEmail(formState.email), {
      success: t('auth:profileEmailAdded'),
      failure: t('auth:profileEmailAddError'),
      // data is defined here: onSuccess only runs once the default isSuccess (Boolean(data)) held.
      onSuccess: ({ data }) => {
        setEmails(data!.data as EmailAddress[])
        resetFormState()
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border">
        {emails.map((emailAddress) => {
          // A primary, already-verified email has no available action (can't re-primary itself,
          // can't resend a verification it already has, can't remove the account's primary email)
          // - the "..." trigger stays visible for layout consistency but must not open an empty menu.
          const hasActions = !emailAddress.primary || !emailAddress.verified

          return (
            <li key={emailAddress.email} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate">{emailAddress.email}</span>
                {emailAddress.primary && <Badge variant="secondary">{t('auth:profileEmailPrimaryBadge')}</Badge>}
                <Badge
                  variant={
                    emailAddress.verified
                      ? // Stryker disable next-line StringLiteral: equivalent mutant. cva's own
                        // defaultVariants fallback treats an empty-string variant the same as
                        // unset, so "" renders identically to 'default' here (verified directly
                        // against class-variance-authority).
                        'default'
                      : 'outline'
                  }
                >
                  {emailAddress.verified ? t('auth:profileEmailVerifiedBadge') : t('auth:profileEmailUnverifiedBadge')}
                </Badge>
              </div>
              {hasActions ? (
                <Overlay breakpoint="md">
                  <OverlayTrigger>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontalIcon className="size-4" />
                      <span className="sr-only">{t('auth:profileEmailActionsLabel')}</span>
                    </Button>
                  </OverlayTrigger>
                  <OverlayContent align="end" className="flex flex-col gap-1 p-1">
                    {!emailAddress.primary && (
                      <Button
                        variant="ghost"
                        className="justify-start"
                        disabled={!emailAddress.verified}
                        onClick={() => makePrimary(emailAddress.email)}
                      >
                        {t('auth:profileEmailMakePrimaryAction')}
                      </Button>
                    )}
                    {!emailAddress.verified && (
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => resendVerification(emailAddress.email)}
                      >
                        {t('auth:profileEmailResendAction')}
                      </Button>
                    )}
                    {!emailAddress.primary && (
                      <Button
                        variant="ghost"
                        className="justify-start text-destructive"
                        onClick={() => remove(emailAddress.email)}
                      >
                        {t('auth:profileEmailRemoveAction')}
                      </Button>
                    )}
                  </OverlayContent>
                </Overlay>
              ) : (
                <Button variant="ghost" size="icon-sm" disabled>
                  <MoreHorizontalIcon className="size-4" />
                  <span className="sr-only">{t('auth:profileEmailActionsLabel')}</span>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <form onSubmit={handleAddEmail} className="flex items-start gap-2">
        <Input
          type="email"
          placeholder={t('auth:emailLabel')}
          value={formState.email}
          onChange={handleFormStateEvent('email')}
          errorText={
            formErrors?.email?.join('\n') ??
            // Stryker disable next-line OptionalChaining: equivalent mutant. This schema only
            // recognizes 'email', so any server error not on that field lands in
            // non_field_errors instead (see useValidatedFormState's acceptServerErrors) -
            // whenever formErrors.email is missing, formErrors.non_field_errors is guaranteed
            // present.
            formErrors?.non_field_errors?.join('\n')
          }
        />
        <Button type="submit" disabled={isSubmitting}>
          {t('auth:profileEmailAddAction')}
        </Button>
      </form>
    </div>
  )
}
