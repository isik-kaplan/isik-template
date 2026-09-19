'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'
import { formatUserAgent } from '@/lib/formatUserAgent'

import { AuthApi, extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { toast } from 'sonner'

type Session = {
  id: number
  ip: string
  is_current: boolean
  user_agent: string
  created_at: number
}

export type SessionsListProps = {
  initialSessions: Session[]
}

export function SessionsList({ initialSessions }: SessionsListProps) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [sessions, setSessions] = useState(initialSessions)
  const [pending, setPending] = useState<number[] | null>(null)
  const others = sessions.filter((session) => !session.is_current)

  async function revoke(ids: number[], successMessage: string) {
    setPending(ids)
    const { data, error } = await new AuthApi(authOrigin()).endSessions(ids)
    setPending(null)

    if (data) {
      setSessions(data.data as Session[])
      toast.success(successMessage)
      // Ending your own session leaves this tab holding a cookie the server no longer honours;
      // the layout's gate is what decides where to send it.
      router.refresh()
      return
    }

    toast.error(extractAuthErrors(error)?.[0]?.message ?? t('auth:profileSessionsRevokeError'))
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border">
        {sessions.map((session) => {
          const device = formatUserAgent(session.user_agent)
          const isPending = pending?.includes(session.id) ?? false

          return (
            <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              {/* min-w-0 is what lets the truncate below actually engage inside a flex row. */}
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium" title={device.raw || undefined}>
                    {device.name ?? t('auth:profileSessionsUnknownDevice')}
                  </span>
                  {session.is_current && <Badge variant="default">{t('auth:profileSessionsCurrentBadge')}</Badge>}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t('auth:profileSessionsMeta', {
                    ip: session.ip,
                    date: new Date(session.created_at * 1000).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => revoke([session.id], t('auth:profileSessionsRevoked'))}
              >
                {isPending ? t('auth:profileSessionsRevoking') : t('auth:profileSessionsRevokeAction')}
              </Button>
            </li>
          )
        })}
      </ul>
      {others.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={pending !== null}
          onClick={() =>
            revoke(
              others.map((session) => session.id),
              t('auth:profileSessionsOthersRevoked')
            )
          }
        >
          {t('auth:profileSessionsRevokeOthersAction', { count: others.length })}
        </Button>
      )}
    </div>
  )
}
