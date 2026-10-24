'use client'

import { useState } from 'react'

import type { Scope } from '@/components/app-applications/ScopeChecklist'
import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { describedScopes, scopeLabel } from '@/lib/oauthScopes'

import { type ApiType, detailOf } from '@{{ cookiecutter.repo_slug }}/api'

import { PersonalAccessTokenForm } from './PersonalAccessTokenForm'
import { useIdempotencyKey } from '@isikk/core/hooks'
import { toast } from 'sonner'

type Token = ApiType<'PersonalAccessToken'>

/** Whether a moment has passed - read when the list renders, which is close enough for "expired". */
export function hasPassed(iso: string, now: number = Date.now()): boolean {
  return new Date(iso).getTime() <= now
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** This person's tokens; a new one's token is shown here once, and never again. */
export function PersonalAccessTokensList({ initialTokens, scopes }: { initialTokens: Token[]; scopes: Scope[] }) {
  const { t } = useClientTranslation(['auth'])
  const [tokens, setTokens] = useState(initialTokens)
  const [making, setMaking] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  // Keyed by which one, so a retry after a lost answer is the same delete rather than a second.
  const deleting = useIdempotencyKey()
  const described = describedScopes(scopes)

  function made(token: Token) {
    setTokens((current) => [token, ...current])
    setIssued(token.token ?? null)
    setMaking(false)
  }

  async function remove(id: string) {
    setPending(id)
    const { error, response } = await createApi(apiOrigin()).deletePersonalAccessToken(id, deleting.keyFor(id))
    setPending(null)

    if (response.ok) {
      deleting.used()
      setTokens((current) => current.filter((token) => token.id !== id))
      toast.success(t('auth:profileTokensDeleted'))
      return
    }

    toast.error(detailOf(error) ?? t('auth:profileTokensDeleteError'))
  }

  function life(token: Token): string {
    if (!token.expires_at) return t('auth:profileTokensNeverExpires')
    if (hasPassed(token.expires_at)) return t('auth:profileTokensExpired', { date: day(token.expires_at) })
    return t('auth:profileTokensExpires', { date: day(token.expires_at) })
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t('auth:profileTokensTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('auth:profileTokensHint')}</p>
      {issued && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <p className="font-semibold">{t('auth:profileTokensIssuedTitle')}</p>
          <p className="text-muted-foreground">{t('auth:profileTokensIssuedHint')}</p>
          <code className="font-mono break-all">{issued}</code>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setIssued(null)}>
            {t('auth:profileTokensIssuedDone')}
          </Button>
        </div>
      )}
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:profileTokensEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                <span className="truncate font-medium">{token.name}</span>
                <span className="text-sm text-muted-foreground">
                  {token.scopes?.length
                    ? token.scopes.map((scope) => scopeLabel(scope, t, described)).join(' · ')
                    : t('auth:profileTokensNoScopes')}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {life(token)} ·{' '}
                  {token.last_used_at
                    ? t('auth:profileTokensLastUsed', { date: day(token.last_used_at) })
                    : t('auth:profileTokensNeverUsed')}
                </span>
              </div>
              <Button variant="outline" size="sm" disabled={pending === token.id} onClick={() => remove(token.id)}>
                {t('auth:profileTokensDelete')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {making ? (
        <div className="border-t border-border pt-4">
          <PersonalAccessTokenForm scopes={scopes} onMade={made} onCancel={() => setMaking(false)} />
        </div>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setMaking(true)}>
          {t('auth:profileTokensNew')}
        </Button>
      )}
    </section>
  )
}
