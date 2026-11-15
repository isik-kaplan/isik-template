'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { NOTIFICATIONS_READ } from './NotificationBell'
import { toast } from 'sonner'

type Item = ApiType<'InboxItem'>
type Kind = ApiType<'NoticeKind'>
type ChannelState = Kind['channels'][string]

// The order a person reads them in. A channel the project added sorts after, by its name.
const CHANNEL_ORDER = ['inbox', 'email', 'push']

/** A kind's channels this person decides on, or staff decided for them: the webhook is neither. */
export function offeredChannels(kind: Kind): [string, ChannelState][] {
  const rank = (channel: string) => CHANNEL_ORDER.indexOf(channel) + 1 || CHANNEL_ORDER.length + 1
  return Object.entries(kind.channels)
    .filter(([, state]) => state.may_change || state.forced)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
}

function channelLabel(channel: string, t: Translate): string {
  if (channel === 'inbox') return t('auth:profileNotificationsChannelInbox')
  if (channel === 'email') return t('auth:profileNotificationsChannelEmail')
  if (channel === 'push') return t('auth:profileNotificationsChannelPush')
  return channel
}

/** What a notification says: the backend renders it, in the request's language, from what its notice carried. */
export function messageOf(item: Item, t: Translate): string {
  return item.message ?? t('auth:notificationSomethingChanged')
}

function actorOf(item: Item, t: Translate): string | null {
  if (item.actor === 'self') return t('auth:profileNotificationsByYou')
  if (item.actor === 'staff') return t('auth:profileNotificationsByStaff')
  if (item.actor === 'other') return t('auth:profileNotificationsByOther')
  return null
}

function moment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** This person's notifications, unread first marked as such, and the kinds they may turn off. */
export function NotificationsList({ initialItems, initialKinds }: { initialItems: Item[]; initialKinds: Kind[] }) {
  const { t } = useClientTranslation(['auth'])
  const [items, setItems] = useState(initialItems)
  const [kinds, setKinds] = useState(initialKinds)
  const [pending, setPending] = useState<string | null>(null)

  // `null` is every item: when one already read was read shows nowhere, so it may as well move.
  function marked(id: string | null, at: string) {
    setItems((current) => current.map((item) => (id === null || item.id === id ? { ...item, read_at: at } : item)))
    window.dispatchEvent(new Event(NOTIFICATIONS_READ))
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

  async function choose(kind: Kind, channel: string, on: boolean) {
    setPending(`${kind.kind}:${channel}`)
    const { data } = await createApi(apiOrigin()).chooseNotifications(kind.kind, on, channel)
    setPending(null)
    if (data) {
      // What they get there now is what they chose: a channel they may change isn't forced.
      setKinds((current) =>
        current.map((each) =>
          each.kind === kind.kind
            ? { ...each, channels: { ...each.channels, [channel]: { ...each.channels[channel], enabled: on } } }
            : each
        )
      )
      toast.success(t('auth:profileNotificationsSaved'))
      return
    }
    toast.error(t('auth:profileNotificationsSaveError'))
  }

  const unread = items.some((item) => !item.read_at)
  // What a person decides, and what staff decided for them; the rest are neither theirs nor shown.
  const offered = kinds.filter((kind) => offeredChannels(kind).length > 0)

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
      {offered.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t('auth:profileNotificationsSettingsTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('auth:profileNotificationsSettingsHint')}</p>
          {offered.map((kind) => {
            const channels = offeredChannels(kind)
            // One line per thing staff said, however many channels they said it of.
            const forced = [
              ...new Set(
                channels
                  .filter(([, state]) => state.forced)
                  .map(([, state]) =>
                    state.forced_reason
                      ? t('auth:profileNotificationsForcedBecause', { reason: state.forced_reason })
                      : t('auth:profileNotificationsForced')
                  )
              ),
            ]
            return (
              <fieldset key={kind.kind} className="flex flex-col gap-1">
                <legend className="text-sm">{kind.label ?? kind.kind}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {channels.map(([channel, state]) => (
                    <label key={channel} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        disabled={state.forced || pending === `${kind.kind}:${channel}`}
                        onChange={(event) => choose(kind, channel, event.target.checked)}
                      />
                      {channelLabel(channel, t)}
                    </label>
                  ))}
                </div>
                {forced.map((said) => (
                  <span key={said} className="text-sm text-muted-foreground">
                    {said}
                  </span>
                ))}
              </fieldset>
            )
          })}
        </div>
      )}
    </section>
  )
}
