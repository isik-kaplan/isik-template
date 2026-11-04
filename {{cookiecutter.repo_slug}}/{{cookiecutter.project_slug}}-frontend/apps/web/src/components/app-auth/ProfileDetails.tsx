'use client'

import { useState } from 'react'

import { EditAction, EditModeProvider, WhileEditing, WhileReading } from '@/components/app/EditMode'

import { useClientTranslation } from '@/i18n/client'
import { editableNames, offeredNames } from '@/lib/names'

import { ProfileNameForm } from './ProfileNameForm'
import type { ProfileUser } from './ProfileNameForm'

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function ProfileDetailsContent({ initialUser }: { initialUser: ProfileUser }) {
  const { t } = useClientTranslation(['auth'])
  // Held here, not refreshed: the save answers with the saved user.
  const [user, setUser] = useState(initialUser)
  const unset = t('auth:profileDetailsUnset')
  const asksFullName = offeredNames().includes('first_name')
  const editable = editableNames(user).length > 0

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div className="flex justify-end">
          <EditAction />
        </div>
      )}
      <WhileReading>
        <dl className="flex flex-col gap-2 text-sm">
          {user.username && <Row label={t('auth:profileDetailsUsernameLabel')} value={user.username} />}
          <Row label={t('auth:profileDetailsEmailLabel')} value={user.email} />
          {asksFullName && (
            <>
              <Row label={t('auth:profileDetailsFirstNameLabel')} value={user.first_name || unset} />
              <Row label={t('auth:profileDetailsLastNameLabel')} value={user.last_name || unset} />
            </>
          )}
        </dl>
      </WhileReading>
      <WhileEditing>
        <ProfileNameForm user={user} onSaved={setUser} />
      </WhileEditing>
    </div>
  )
}

/** The account's details; only the names, and a handle not yet chosen, are editable here. */
export function ProfileDetails({ user }: { user: ProfileUser }) {
  return (
    <EditModeProvider>
      <ProfileDetailsContent initialUser={user} />
    </EditModeProvider>
  )
}
