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
  // Held here rather than re-fetched: the save answers with the saved user, and a refresh would
  // re-render every server component on the page to show two names.
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

/** The account's own details, read first; only the names are editable - username and email are
 *  fixed past signup, and email has its own tab. */
export function ProfileDetails({ user }: { user: ProfileUser }) {
  return (
    <EditModeProvider>
      <ProfileDetailsContent initialUser={user} />
    </EditModeProvider>
  )
}
