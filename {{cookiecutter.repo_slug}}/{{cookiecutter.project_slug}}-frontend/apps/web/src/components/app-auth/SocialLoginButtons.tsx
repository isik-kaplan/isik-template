'use client'

import { useClientTranslation } from '@/i18n/client'
import { socialProviders } from '@/lib/socialProviders'

import { AutoFormButton } from './AutoFormButton'
import { ProviderIcon } from './ProviderIcon'

export type SocialLoginButtonsProps = {
  // Both full absolute URLs, computed server-side by the page (getRequestOrigin) and passed down
  // - see AutoFormButton's own comment on why this isn't built here from window.location.origin.
  action: string
  callbackUrl: string
}

export function SocialLoginButtons({ action, callbackUrl }: SocialLoginButtonsProps) {
  const { t } = useClientTranslation(['auth'])
  const providers = socialProviders()
  if (providers.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => {
        const payload = { provider: provider.id, callback_url: callbackUrl, process: 'login' }
        return (
          <AutoFormButton key={provider.id} variant="outline" action={action} payload={payload}>
            <ProviderIcon providerId={provider.id} name={provider.name} iconUrl={provider.icon} />
            {t('auth:continueWith', { provider: provider.name })}
          </AutoFormButton>
        )
      })}
    </div>
  )
}
