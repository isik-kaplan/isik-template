'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'
import { useState } from 'react'

import { type Scope, ScopeChecklist } from '@/components/app-applications/ScopeChecklist'
import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

type ManagedUser = ApiType<'ManagedUser'>
type Flag = 'is_active' | 'is_staff' | 'is_superuser'

/** Whether somebody may sign in, their rank, and what they were granted. The backend decides what the
 *  person changing it may do - see apps/users/granting.py - and says so when they may not. */
export function ManageUserForm({ user, permissions }: { user: ManagedUser; permissions: Scope[] }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  const [flags, setFlags] = useState<Record<Flag, boolean>>({
    is_active: user.is_active ?? true,
    is_staff: user.is_staff ?? false,
    is_superuser: user.is_superuser ?? false,
  })
  const [granted, setGranted] = useState<string[]>(user.permissions ?? [])

  // Spelled out because i18next-parser only finds a literal key.
  const labels: Record<Flag, string> = {
    is_active: t('auth:peopleIsActive'),
    is_staff: t('auth:peopleIsStaff'),
    is_superuser: t('auth:peopleIsSuperuser'),
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit(
      () =>
        createApi(apiOrigin()).updateUser(user.id, {
          ...flags,
          permissions: granted as NonNullable<ManagedUser['permissions']>,
        }),
      { success: t('auth:peopleSaved'), failure: t('auth:peopleSaveError'), onSuccess: () => router.refresh() }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('auth:peopleAccessLegend')}</legend>
        {(Object.keys(labels) as Flag[]).map((flag) => (
          <label key={flag} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={flag}
              checked={flags[flag]}
              onChange={(event) => setFlags((current) => ({ ...current, [flag]: event.target.checked }))}
            />
            {labels[flag]}
          </label>
        ))}
      </fieldset>
      <ScopeChecklist
        legend={t('auth:peoplePermissionsLegend')}
        scopes={permissions}
        value={granted}
        onChange={setGranted}
      />
      <Button type="submit" className="self-start" disabled={isSubmitting}>
        {t('auth:peopleSave')}
      </Button>
    </form>
  )
}
