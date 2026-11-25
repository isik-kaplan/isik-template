'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'
import { useState } from 'react'

import { type Scope, ScopeChecklist } from '@/components/app-applications/ScopeChecklist'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'

type Group = ApiType<'Group'>
type Names = NonNullable<Group['permissions']>

/** A group's name and what it gives; with `group`, changes and deletes that one, against `etag`. */
export function GroupForm({
  group,
  etag = null,
  permissions,
}: {
  group?: Group
  // The read's ETag header: the version this form was opened on.
  etag?: string | null
  permissions: Scope[]
}) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  const saving = useIdempotencyKey()
  const deleting = useIdempotencyKey()
  const [name, setName] = useState(group?.name ?? '')
  const [given, setGiven] = useState<string[]>(group?.permissions ?? [])
  const api = () => createApi(apiOrigin())

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const changes = { name, permissions: given as Names }
    const settled = {
      success: t('auth:groupSaved'),
      failure: t('auth:groupSaveError'),
      leavesOnSuccess: !group,
      // Somebody else changed it since this page loaded: shown as it is now, to decide again.
      onStale: () => router.refresh(),
    }
    if (group) {
      await submit((headers) => api().updateGroup(group.id, changes, { ...headers, ...saving.headerFor(changes) }), {
        ...settled,
        etag,
        onSuccess: () => {
          saving.used()
          router.refresh()
        },
      })
    } else {
      await submit(() => api().createGroup(changes, saving.keyFor(changes)), {
        ...settled,
        onSuccess: ({ data }) => {
          saving.used()
          router.push(`/groups/${data.id}`)
        },
      })
    }
  }

  async function handleDelete(existing: Group) {
    // Against the version shown, so a change made since is not deleted unseen.
    await submit((headers) => api().deleteGroup(existing.id, { ...headers, ...deleting.headerFor(null) }), {
      success: t('auth:groupDeleted'),
      failure: t('auth:groupDeleteError'),
      etag,
      leavesOnSuccess: true,
      onStale: () => router.refresh(),
      onSuccess: () => {
        deleting.used()
        router.push('/groups')
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="group_name">{t('auth:groupNameLabel')}</Label>
        <Input id="group_name" name="name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <ScopeChecklist
        legend={t('auth:groupPermissionsLegend')}
        scopes={permissions}
        value={given}
        onChange={setGiven}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {group ? t('auth:groupSave') : t('auth:groupCreate')}
        </Button>
        {group && (
          <Button type="button" variant="destructive" disabled={isSubmitting} onClick={() => handleDelete(group)}>
            {t('auth:groupDelete')}
          </Button>
        )}
      </div>
    </form>
  )
}
