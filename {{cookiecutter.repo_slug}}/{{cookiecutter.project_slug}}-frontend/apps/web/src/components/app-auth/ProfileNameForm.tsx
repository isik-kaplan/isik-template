'use client'

import { useMemo } from 'react'
import type React from 'react'

import { ConflictNotice } from '@/components/app/ConflictNotice'
import { SaveActions, useEditMode } from '@/components/app/EditMode'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { editableNames } from '@/lib/names'
import { useVersionedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { NameFields, nameSchema, shownNames } from './NameFields'
import { z } from 'zod'

// The read's ETag; null for the session's fallback copy, so a save is refused (428).
export type ProfileUser = Pick<ApiType<'User'>, 'email' | 'first_name' | 'last_name'> & {
  username?: string | null
  etag: string | null
}

export function ProfileNameForm({ user, onSaved }: { user: ProfileUser; onSaved: (user: ProfileUser) => void }) {
  const { t } = useClientTranslation(['auth'])
  const { stop } = useEditMode()
  const shown = editableNames(user)
  const schema = useMemo(() => z.object(nameSchema(t)), [t])
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit, conflict, takeTheirs, keepMine } =
    useVersionedFormState(
      schema,
      // Optional in the document because a write may leave them out; a read always carries both.
      { first_name: user.first_name ?? '', last_name: user.last_name ?? '', username: user.username ?? '' },
      // So another tab's save is not overwritten.
      { etag: user.etag }
    )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit((names, headers) => createApi(apiOrigin()).updateMe(shownNames(names, shown), headers), {
      failure: t('auth:profileDetailsSaveError'),
      // The save's ETag goes with it.
      onSuccess: ({ data }, { etag }) => {
        onSaved({ ...data, etag })
        stop()
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <NameFields shown={shown} values={formState} errors={formErrors} onChange={handleFormStateEvent} />
      {formErrors?.non_field_errors && <p className="text-sm text-destructive">{formErrors.non_field_errors[0]}</p>}
      <ConflictNotice conflict={conflict} takeTheirs={takeTheirs} keepMine={keepMine} disabled={isSubmitting} />
      <SaveActions isSubmitting={isSubmitting} />
    </form>
  )
}
