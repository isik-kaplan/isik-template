import { useEffect, useState } from 'react'

import { Button, Heading, ListRow, Screen, Text, TextButton } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'

type Session = { id: number; ip: string; is_current: boolean; user_agent: string; created_at: number }

export default function ProfileSessions() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<Session[]>([])
  const [pending, setPending] = useState<number[] | null>(null)
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .sessions()
      .then(({ data }) => {
        if (isMounted()) setSessions(data?.data ?? [])
      })
  }, [isMounted])

  const others = sessions.filter((session) => !session.is_current)

  async function revoke(ids: number[]) {
    setPending(ids)
    const { data } = await getAuthApi().endSessions(ids)
    setPending(null)
    if (data) setSessions(data.data)
  }

  return (
    <Screen testID="profile-sessions" back>
      <Heading testID="profile-sessions-heading">{t('profileSessionsHeading')}</Heading>
      {sessions.map((session) => {
        const isPending = pending?.includes(session.id) ?? false
        return (
          <ListRow key={session.id} testID={`session-row-${session.id}`}>
            <Text testID={`session-label-${session.id}`}>
              {session.ip}
              {session.is_current ? t('profileSessionsThisDeviceSuffix') : ''}
            </Text>
            {!session.is_current && (
              <TextButton
                testID={`revoke-session-${session.id}`}
                disabled={isPending}
                label={isPending ? t('profileSessionsRevoking') : t('profileSessionsRevoke')}
                onPress={() => revoke([session.id])}
              />
            )}
          </ListRow>
        )
      })}
      {others.length > 0 && (
        <Button
          testID="revoke-other-sessions"
          labelTestID="revoke-other-sessions-label"
          disabled={pending !== null}
          onPress={() => revoke(others.map((session) => session.id))}
          label={t('profileSessionsRevokeOthers')}
        />
      )}
    </Screen>
  )
}
