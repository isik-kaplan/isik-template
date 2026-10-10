'use client'

import { useMemo } from 'react'
import type React from 'react'

import { SaveActions, useEditMode } from '@/components/app/EditMode'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useValidatedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { z } from 'zod'

// Django's own max_length on both name columns.
const NAME_MAX_LENGTH = 150

export type ProfileUser = Pick<ApiType<'User'>, 'username' | 'email' | 'first_name' | 'last_name'>

export function ProfileNameForm({ user, onSaved }: { user: ProfileUser; onSaved: (user: ProfileUser) => void }) {
  const { t } = useClientTranslation(['auth'])
  const { stop } = useEditMode()
  const schema = useMemo(() => {
    const name = z.string().max(NAME_MAX_LENGTH, t('auth:validationNameTooLong'))
    return z.object({ first_name: name, last_name: name })
  }, [t])
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useValidatedFormState(
    schema,
    // Optional in the document because a write may leave them out; a read always carries both.
    { first_name: user.first_name ?? '', last_name: user.last_name ?? '' }
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit((names) => createApi(apiOrigin()).updateMe(names), {
      failure: t('auth:profileDetailsSaveError'),
      // A PATCH, which sends no idempotency key.
      idempotencyKey: false,
      // data is defined here: onSuccess only runs once the default success check held.
      onSuccess: ({ data }) => {
        onSaved(data!)
        stop()
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="first_name">{t('auth:profileDetailsFirstNameLabel')}</Label>
        <Input
          id="first_name"
          name="first_name"
          autoComplete="given-name"
          value={formState.first_name}
          onChange={handleFormStateEvent('first_name')}
          errorText={formErrors?.first_name?.[0]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="last_name">{t('auth:profileDetailsLastNameLabel')}</Label>
        <Input
          id="last_name"
          name="last_name"
          autoComplete="family-name"
          value={formState.last_name}
          onChange={handleFormStateEvent('last_name')}
          errorText={formErrors?.last_name?.[0]}
        />
      </div>
      {formErrors?.non_field_errors && <p className="text-sm text-destructive">{formErrors.non_field_errors[0]}</p>}
      <SaveActions isSubmitting={isSubmitting} />
    </form>
  )
}
