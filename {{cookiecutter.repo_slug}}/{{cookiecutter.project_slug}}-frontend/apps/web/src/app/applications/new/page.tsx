import { RegisterApplication } from '@/components/app-applications/RegisterApplication'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { serverApi } from '@/lib/serverApi'

export default async function NewApplicationPage() {
  const { t } = await sUseTranslation(['auth'])
  const { data: scopes } = await (await serverApi()).delegatableScopes()

  return (
    <PageShell
      title={t('auth:applicationsRegister')}
      description={t('auth:applicationsRegisterHint')}
      backHref="/applications"
      backLabel={t('auth:applicationsBack')}
    >
      <RegisterApplication scopes={scopes ?? []} />
    </PageShell>
  )
}
