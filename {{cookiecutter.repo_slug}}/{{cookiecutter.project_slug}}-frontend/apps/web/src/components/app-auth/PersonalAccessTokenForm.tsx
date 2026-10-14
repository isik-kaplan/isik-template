'use client'

import { useMemo } from 'react'
import type React from 'react'

import { type Scope, ScopeChecklist } from '@/components/app-applications/ScopeChecklist'
import { FIELD_CLASS } from '@/components/app-applications/fieldClass'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useValidatedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { z } from 'zod'

const DAY = 24 * 60 * 60 * 1000

// Days from now, or never - the choice GitHub offers, without its custom date.
const EXPIRIES = ['7', '30', '90', '365', 'never'] as const
type Expiry = (typeof EXPIRIES)[number]

/** When a token chosen to last `expiry` stops working, counted from `now`. */
export function expiresAt(expiry: Expiry, now: number = Date.now()): string | null {
  return expiry === 'never' ? null : new Date(now + Number(expiry) * DAY).toISOString()
}

/** Making a token: what it is called, what it may do of what this person holds, and for how long. Making
 *  one asks them to prove who they are first - the backend sends them off to do it. */
export function PersonalAccessTokenForm({
  scopes,
  onMade,
  onCancel,
}: {
  scopes: Scope[]
  onMade: (token: ApiType<'PersonalAccessToken'>) => void
  onCancel: () => void
}) {
  const { t } = useClientTranslation(['auth'])
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t('auth:validationTokenNameRequired')),
          scopes: z.array(z.string()),
          expiry: z.enum(EXPIRIES),
        })
        .transform(({ expiry, ...token }) => ({ ...token, expires_at: expiresAt(expiry) })),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, handleFormStateValue, isSubmitting, submit } =
    useValidatedFormState(schema, { name: '', scopes: [] as string[], expiry: '30' as Expiry })

  // i18next-parser only detects a literal key, so each choice is spelled out.
  const labels: Record<Expiry, string> = {
    '7': t('auth:profileTokensExpiryWeek'),
    '30': t('auth:profileTokensExpiryMonth'),
    '90': t('auth:profileTokensExpiryQuarter'),
    '365': t('auth:profileTokensExpiryYear'),
    never: t('auth:profileTokensExpiryNever'),
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit((token, idempotencyKey) => createApi(apiOrigin()).makePersonalAccessToken(token, idempotencyKey), {
      failure: t('auth:profileTokensMakeError'),
      onSuccess: ({ data }) => onMade(data!),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="token_name">{t('auth:profileTokensNameLabel')}</Label>
        <Input
          id="token_name"
          name="name"
          value={formState.name}
          onChange={handleFormStateEvent('name')}
          errorText={formErrors?.name?.[0]}
        />
      </div>
      <ScopeChecklist
        legend={t('auth:profileTokensScopesLabel')}
        scopes={scopes}
        value={formState.scopes}
        onChange={handleFormStateValue('scopes')}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="token_expiry">{t('auth:profileTokensExpiryLabel')}</Label>
        <select
          id="token_expiry"
          name="expiry"
          className={FIELD_CLASS}
          value={formState.expiry}
          onChange={handleFormStateEvent('expiry')}
        >
          {EXPIRIES.map((expiry) => (
            <option key={expiry} value={expiry}>
              {labels[expiry]}
            </option>
          ))}
        </select>
        {formState.expiry === 'never' && (
          <p className="text-sm text-muted-foreground">{t('auth:profileTokensNeverWarning')}</p>
        )}
      </div>
      {formErrors?.non_field_errors && <p className="text-sm text-destructive">{formErrors.non_field_errors[0]}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('auth:profileTokensSubmit')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('auth:profileTokensCancel')}
        </Button>
      </div>
    </form>
  )
}
