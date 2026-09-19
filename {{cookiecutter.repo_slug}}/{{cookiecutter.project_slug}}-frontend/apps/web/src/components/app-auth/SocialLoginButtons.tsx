'use client'

import { useClientTranslation } from '@/i18n'
import { SOCIAL_PROVIDERS } from '@/lib/socialProviders'

import { AutoFormButton } from './AutoFormButton'
import { ProviderIcon } from './ProviderIcon'

export type SocialLoginButtonsProps = {
  // Both full absolute URLs, computed server-side by the page (getRequestOrigin) and passed down
  // - see AutoFormButton's own comment on why this isn't built here from window.location.origin.
  action: string
  callbackUrl: string
}

export function SocialLoginButtons({ action, callbackUrl }: SocialLoginButtonsProps) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  if (SOCIAL_PROVIDERS.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {SOCIAL_PROVIDERS.map((provider) => {
        const payload = { provider: provider.id, callback_url: callbackUrl, process: 'login' }
        return (
          <AutoFormButton key={provider.id} variant="outline" action={action} payload={payload}>
            <ProviderIcon providerId={provider.id} iconUrl={provider.icon} />
            {t('auth:continueWith', { provider: provider.name })}
          </AutoFormButton>
        )
      })}
    </div>
  )
}
