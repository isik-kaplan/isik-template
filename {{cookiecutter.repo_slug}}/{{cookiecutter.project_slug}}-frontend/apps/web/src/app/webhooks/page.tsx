import { notFound } from 'next/navigation'

import { WebhookEndpoints } from '@/components/app-webhooks/WebhookEndpoints'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { mayManageWebhooks } from '@/lib/access'
import { serverApi } from '@/lib/serverApi'

/** Where notifications are POSTed{% if cookiecutter.webhooks == "staff" %}, for the whole deployment{% endif %}. */
export default async function WebhooksPage() {
  const api = await serverApi()
  const { data: me } = await api.me()
  if (!me || !mayManageWebhooks(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const [endpoints, kinds] = await Promise.all([api.notificationEndpoints(), api.notificationKinds()])

  return (
    <PageShell
      title={t('auth:webhooksTitle')}
      description={t('auth:webhooksDescription')}
      backHref="/"
      backLabel={t('auth:backToHome')}
    >
      <WebhookEndpoints endpoints={endpoints.data?.results ?? []} kinds={kinds.data ?? []} />
    </PageShell>
  )
}
