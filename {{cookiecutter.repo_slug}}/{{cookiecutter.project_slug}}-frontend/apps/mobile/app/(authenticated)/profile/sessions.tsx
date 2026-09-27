import { useEffect, useState } from 'react'

import { Button, Heading, ListRow, Screen } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'
import { Pressable, Text } from 'react-native'

type Session = { id: number; ip: string; is_current: boolean; user_agent: string; created_at: number }

export default function ProfileSessions() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<Session[]>([])
  const [pending, setPending] = useState<number[] | null>(null)
  const isMounted = useIsMounted()

  // Equivalent mutant either way, both the guard and the deps array - see
  // lib/useAuthenticated.ts's own copy of this same effect for why.
  // Stryker disable ArrayDeclaration,ConditionalExpression
  useEffect(() => {
    getAuthApi()
      .sessions()
      .then(({ data }) => {
        if (isMounted()) setSessions(data?.data ?? [])
      })
  }, [isMounted])
  // Stryker restore ArrayDeclaration,ConditionalExpression

  const others = sessions.filter((session) => !session.is_current)

  async function revoke(ids: number[]) {
    setPending(ids)
    const { data } = await getAuthApi().endSessions(ids)
    setPending(null)
    if (data) setSessions(data.data)
  }

  return (
    <Screen testID="profile-sessions">
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
              <Pressable
                testID={`revoke-session-${session.id}`}
                disabled={isPending}
                onPress={() => revoke([session.id])}
              >
                <Text>{isPending ? t('profileSessionsRevoking') : t('profileSessionsRevoke')}</Text>
              </Pressable>
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
