'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { toast } from 'sonner'

type Item = ApiType<'InboxItem'>
type Kind = ApiType<'ChoosableKind'>
type Choice = ApiType<'Subscription'>

/** What a notification says, from its kind and what its notice carried. */
export function messageOf(item: Item, t: Translate): string {
  const name = String((item.payload as { data?: { name?: unknown } } | null)?.data?.name ?? '')
  // Spelled out: i18next-parser only detects literal keys.
  switch (`${item.kind}:${item.variant ?? ''}`) {
    case 'token_created:':
      return t('auth:notificationTokenCreated', { name })
    case 'token_revoked:':
      return t('auth:notificationTokenRevoked', { name })
    case 'application_reviewed:approved':
      return t('auth:notificationApplicationApproved', { name })
    case 'application_reviewed:withdrawn':
      return t('auth:notificationApplicationWithdrawn', { name })
    case 'signed_out_by_policy:':
      return t('auth:notificationSignedOutByPolicy')
    case 'account_changed:password_changed':
      return t('auth:notificationPasswordChanged')
    case 'account_changed:password_set':
      return t('auth:notificationPasswordSet')
    case 'account_changed:email_changed':
      return t('auth:notificationEmailChanged')
    case 'account_changed:email_deleted':
      return t('auth:notificationEmailDeleted')
    case 'account_changed:totp_activated':
      return t('auth:notificationTotpActivated')
    case 'account_changed:totp_deactivated':
      return t('auth:notificationTotpDeactivated')
    case 'account_changed:recovery_codes_generated':
      return t('auth:notificationRecoveryCodesGenerated')
    case 'account_changed:webauthn_added':
      return t('auth:notificationWebauthnAdded')
    case 'account_changed:webauthn_removed':
      return t('auth:notificationWebauthnRemoved')
    case 'account_changed:account_connected':
      return t('auth:notificationAccountConnected')
    case 'account_changed:account_disconnected':
      return t('auth:notificationAccountDisconnected')
    default:
      return t('auth:notificationSomethingChanged')
  }
}

function actorOf(item: Item, t: Translate): string | null {
  if (item.actor === 'self') return t('auth:profileNotificationsByYou')
  if (item.actor === 'staff') return t('auth:profileNotificationsByStaff')
  if (item.actor === 'other') return t('auth:profileNotificationsByOther')
  return null
}

function kindLabel(kind: string, t: Translate): string {
  return kind === 'account_changed'
    ? t('auth:notificationKindAccountChanged')
    : t('auth:notificationKindApplicationReviewed')
}

function moment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** This person's notifications, unread first marked as such, and the kinds they may turn off. */
export function NotificationsList({
  initialItems,
  kinds,
  initialChoices,
}: {
  initialItems: Item[]
  kinds: Kind[]
  initialChoices: Choice[]
}) {
  const { t } = useClientTranslation(['auth'])
  const [items, setItems] = useState(initialItems)
  const [choices, setChoices] = useState(initialChoices)
  const [pending, setPending] = useState<string | null>(null)

  // `null` is every item: when one already read was read shows nowhere, so it may as well move.
  function marked(id: string | null, at: string) {
    setItems((current) => current.map((item) => (id === null || item.id === id ? { ...item, read_at: at } : item)))
  }

  async function markRead(id: string) {
    setPending(id)
    // Set only for a 2xx: openapi-fetch puts anything else in `error`.
    const { data } = await createApi(apiOrigin()).markNotificationRead(id)
    setPending(null)
    if (data) {
      marked(id, data.read_at ?? new Date().toISOString())
      return
    }
    toast.error(t('auth:profileNotificationsMarkError'))
  }

  async function markAllRead() {
    setPending('all')
    const { response } = await createApi(apiOrigin()).markAllNotificationsRead()
    setPending(null)
    if (response.ok) {
      marked(null, new Date().toISOString())
      return
    }
    toast.error(t('auth:profileNotificationsMarkError'))
  }

  function enabled(kind: Kind): boolean {
    const choice = choices.find((current) => current.kind === kind.kind && current.variant === null)
    return choice ? choice.enabled !== false : kind.policy === 'default_on'
  }

  async function choose(kind: Kind, on: boolean) {
    setPending(kind.kind)
    const { data } = await createApi(apiOrigin()).chooseNotifications(kind.kind, on)
    setPending(null)
    if (data) {
      setChoices((current) => [...current.filter((choice) => choice.kind !== kind.kind), data])
      toast.success(t('auth:profileNotificationsSaved'))
      return
    }
    toast.error(t('auth:profileNotificationsSaveError'))
  }

  const unread = items.some((item) => !item.read_at)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('auth:profileNotificationsTitle')}</h3>
        {unread && (
          <Button variant="ghost" size="sm" disabled={pending === 'all'} onClick={markAllRead}>
            {t('auth:profileNotificationsMarkAllRead')}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:profileNotificationsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const actor = actorOf(item, t)
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                  <span className={item.read_at ? 'text-sm' : 'text-sm font-semibold'}>{messageOf(item, t)}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {actor ? `${moment(item.created_at)} · ${actor}` : moment(item.created_at)}
                  </span>
                </div>
                {!item.read_at && (
                  <Button variant="outline" size="sm" disabled={pending === item.id} onClick={() => markRead(item.id)}>
                    {t('auth:profileNotificationsMarkRead')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {kinds.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t('auth:profileNotificationsSettingsTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('auth:profileNotificationsSettingsHint')}</p>
          {kinds.map((kind) => (
            <label key={kind.kind} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled(kind)}
                disabled={pending === kind.kind}
                onChange={(event) => choose(kind, event.target.checked)}
              />
              {kindLabel(kind.kind, t)}
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
