'use client'

import { useState } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'

import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'

import { type ApiType, etagOf } from '@{{ cookiecutter.repo_slug }}/api'

import { ifMatch } from '@isikk/core'
import { toast } from 'sonner'

type Setting = ApiType<'Setting'>
type Feature = ApiType<'Feature'>

/** Why a setting is what it is, when that is anybody's but the person's own doing. */
export function whyOf(setting: Setting, t: Translate): string | null {
  if (setting.origin === 'forced') {
    return setting.forced_reason
      ? t('auth:profileSettingsForcedBecause', { reason: setting.forced_reason })
      : t('auth:profileSettingsForced')
  }
  if (setting.origin === 'feature_missing') return t('auth:profileSettingsNeedsFeature')
  if (setting.origin === 'limited') return t('auth:profileSettingsLimited')
  return null
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

/** When a feature stops, as the last of its grants ends; none while any grant never does. */
export function lastEnd(feature: Feature): string | null {
  const ends = feature.grants.map((grant) => grant.expires_at)
  if (ends.length === 0 || ends.includes(null)) return null
  return new Date(Math.max(...(ends as string[]).map((at) => Date.parse(at)))).toISOString()
}

/** The value a draft names, as the setting's own type; text it can't be is left to the backend to refuse. */
export function parsed(setting: Setting, draft: string): unknown {
  if (setting.type === 'int' || setting.type === 'float') return draft.trim() === '' ? draft : Number(draft)
  return draft
}

/** The person's settings - each says what it is and why it's that value - and the features they have. */
export function SettingsList({
  initialSettings,
  initialEtag,
  features,
}: {
  initialSettings: Setting[]
  initialEtag: string | null
  features: Feature[]
}) {
  const { t } = useClientTranslation(['auth'])
  const [settings, setSettings] = useState(initialSettings)
  const [etag, setEtag] = useState(initialEtag)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string | null>(null)

  async function reread() {
    const response = await createApi(apiOrigin()).settings()
    if (response.data) {
      setSettings(response.data)
      setEtag(etagOf(response.response))
    }
  }

  async function change(setting: Setting, value: unknown) {
    if (etag === null) return
    setPending(setting.name)
    const body = { type: setting.type, value } as ApiType<'PatchedSettingValueRequest'>
    const { data, error, response } = await createApi(apiOrigin()).changeSetting(setting.name, body, ifMatch(etag))
    setPending(null)
    if (data) {
      setSettings((current) => current.map((each) => (each.name === data.name ? data : each)))
      setEtag(etagOf(response))
      setDrafts(({ [setting.name]: _saved, ...rest }) => rest)
      toast.success(t('auth:profileSettingsSaved'))
      return
    }
    if (response.status === 412) {
      toast.error(t('common:staleChanged'))
      await reread()
      return
    }
    // A refused value names it on `value`; any other refusal says why in `detail`.
    const detail = error as { value?: string[]; detail?: string }
    toast.error(detail.value?.[0] ?? detail.detail ?? t('auth:profileSettingsSaveError'))
  }

  function control(setting: Setting) {
    const disabled = !setting.may_change || pending === setting.name
    if (setting.type === 'bool') {
      return (
        <input
          id={`setting_${setting.name}`}
          type="checkbox"
          checked={setting.value === true}
          disabled={disabled}
          onChange={(event) => change(setting, event.target.checked)}
        />
      )
    }
    if (setting.type === 'choice') {
      return (
        <select
          id={`setting_${setting.name}`}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={String(setting.value)}
          disabled={disabled}
          onChange={(event) => change(setting, event.target.value)}
        >
          {setting.choices.map((choice) => (
            <option key={String(choice.value)} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </select>
      )
    }
    const draft = drafts[setting.name] ?? String(setting.value)
    function save(event: React.FormEvent) {
      event.preventDefault()
      change(setting, parsed(setting, draft))
    }
    return (
      <form onSubmit={save} className="flex items-center gap-2">
        <Input
          id={`setting_${setting.name}`}
          className="w-32"
          inputMode={setting.type === 'int' || setting.type === 'float' ? 'numeric' : undefined}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDrafts((current) => ({ ...current, [setting.name]: event.target.value }))}
        />
        {setting.may_change && drafts[setting.name] !== undefined && (
          <Button type="submit" size="sm" disabled={pending === setting.name}>
            {t('auth:profileSettingsSave')}
          </Button>
        )}
      </form>
    )
  }

  const held = features.filter((feature) => feature.held)

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">{t('auth:profileSettingsTitle')}</h3>
      <ul className="divide-y divide-border">
        {settings.map((setting) => {
          const why = whyOf(setting, t)
          return (
            <li key={setting.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                <label htmlFor={`setting_${setting.name}`} className="text-sm font-medium">
                  {setting.label ?? setting.name}
                </label>
                {setting.description && <span className="text-sm text-muted-foreground">{setting.description}</span>}
                {why && <span className="text-sm text-muted-foreground">{why}</span>}
              </div>
              {control(setting)}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">{t('auth:profileFeaturesTitle')}</h3>
        {held.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('auth:profileFeaturesNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {held.map((feature) => {
              const ends = lastEnd(feature)
              return (
                <li key={feature.name} className="text-sm">
                  {feature.label ?? feature.name}
                  {ends ? ` · ${t('auth:profileFeaturesUntil', { date: day(ends) })}` : ''}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
