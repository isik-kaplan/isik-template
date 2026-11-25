import { notFound } from 'next/navigation'

import { SiteSettingsForm } from '@/components/app-admin/SiteSettingsForm'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { mayChangeSiteSettings } from '@/lib/access'
import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

/** The site-wide settings, for staff: for now, who may sign in at all. */
export default async function SiteSettingsPage() {
  const api = await serverApi()
  const [{ data: me }, { data: settings, response }] = await Promise.all([api.me(), api.siteSettings()])
  if (!me || !settings || !mayChangeSiteSettings(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const etag = etagOf(response)

  return (
    <PageShell title={t('auth:settingsTitle')}>
      <SiteSettingsForm key={etag} settings={settings} etag={etag} isSuperuser={me.is_superuser} />
    </PageShell>
  )
}
