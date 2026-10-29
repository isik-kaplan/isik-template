import { SettingsList } from '@/components/app-auth/SettingsList'

import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

export default async function ProfileSettingsPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const api = await serverApi()
  const [settings, features] = await Promise.all([api.settings(), api.features()])

  return (
    <SettingsList
      initialSettings={settings.data ?? []}
      // Null when the read failed: a save is then refused rather than sent unversioned.
      initialEtag={settings.data ? etagOf(settings.response) : null}
      features={features.data ?? []}
    />
  )
}
