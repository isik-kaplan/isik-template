'use client'

import { useState } from 'react'

import { EditAction, EditModeProvider, WhileEditing, WhileReading } from '@/components/app/EditMode'

import { useClientTranslation } from '@/i18n/client'

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <EditAction />
      </div>
      <WhileReading>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label={t('auth:profileDetailsUsernameLabel')} value={user.username} />
          <Row label={t('auth:profileDetailsEmailLabel')} value={user.email} />
          <Row label={t('auth:profileDetailsFirstNameLabel')} value={user.first_name || unset} />
          <Row label={t('auth:profileDetailsLastNameLabel')} value={user.last_name || unset} />
        </dl>
      </WhileReading>
      <WhileEditing>
        <ProfileNameForm user={user} onSaved={setUser} />
      </WhileEditing>
    </div>
  )
}

/** The account's details; only the names are editable here. */
export function ProfileDetails({ user }: { user: ProfileUser }) {
  return (
    <EditModeProvider>
      <ProfileDetailsContent initialUser={user} />
    </EditModeProvider>
  )
}
