import { notFound } from 'next/navigation'

import { FIELD_CLASS } from '@/components/app-applications/fieldClass'
import { AuthCard, AuthCenteredLayout } from '@/components/app-auth/AuthCard'
import { DeviceConsent } from '@/components/app-device/DeviceConsent'
import { SessionWatcher } from '@/components/app/SessionWatcher'
import { Button } from '@/components/base/button'
import { Label } from '@/components/base/label'

import { sUseTranslation } from '@/i18n'
import { applicationsAreOn } from '@/lib/access'
import { requireSession } from '@/lib/getSession'
import { describedScopes, scopeLabel } from '@/lib/oauthScopes'
import { serverApi } from '@/lib/serverApi'

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Where a device sends somebody to enter its code and answer it, signed in so it is for their account. */
export default async function DevicePage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  if (!applicationsAreOn()) notFound()
  const code = first((await searchParams).code)?.trim() ?? ''
  const here = code ? `/device?code=${encodeURIComponent(code)}` : '/device'
  await requireSession(`/auth/login?next=${encodeURIComponent(here)}`)
  const { t } = await sUseTranslation(['auth'])

  const api = await serverApi()
  const device = code ? (await api.deviceAuthorization(code)).data : undefined

  if (device) {
    const { data: scopes } = await api.delegatableScopes()
    const described = describedScopes(scopes)
    return (
      <AuthCenteredLayout>
        <SessionWatcher />
        <AuthCard
          title={t('auth:deviceConsentTitle', { application: device.application_name })}
          description={t('auth:deviceConsentIntro', {
            application: device.application_name,
            project: t('auth:appTitle'),
          })}
        >
          {device.application_description && <p className="text-sm">{device.application_description}</p>}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {device.scopes.map((scope) => (
              <li key={scope}>{scopeLabel(scope, t, described)}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t('auth:deviceConsentCode', { code: device.user_code })}</p>
          <DeviceConsent userCode={device.user_code} />
        </AuthCard>
      </AuthCenteredLayout>
    )
  }

  return (
    <AuthCenteredLayout>
      <SessionWatcher />
      <AuthCard title={t('auth:deviceTitle')} description={t('auth:deviceIntro')}>
        {/* A plain GET back here: the code goes in the address, as a device's own link carries it. */}
        <form method="get" action="/device" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="device_code">{t('auth:deviceCodeLabel')}</Label>
            <input
              id="device_code"
              name="code"
              required
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              defaultValue={code}
              aria-invalid={code ? true : undefined}
              className={`${FIELD_CLASS} font-mono tracking-widest uppercase`}
            />
            {code && <p className="text-sm text-destructive">{t('auth:deviceCodeUnknown')}</p>}
          </div>
          <Button type="submit">{t('auth:deviceCodeSubmit')}</Button>
        </form>
      </AuthCard>
    </AuthCenteredLayout>
  )
}
