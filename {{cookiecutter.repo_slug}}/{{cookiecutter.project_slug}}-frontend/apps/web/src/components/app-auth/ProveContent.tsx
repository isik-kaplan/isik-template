'use client'

import { useClientTranslation } from '@/i18n/client'

import type { components } from '@{{ cookiecutter.repo_slug }}/api'

import { AutoFormButton } from './AutoFormButton'
import { MfaChallengeForm } from './MfaChallengeForm'
import { ProvePasswordForm } from './ProvePasswordForm'
import { ProveSetPasswordByEmail } from './ProveSetPasswordByEmail'

type Flow = components['schemas']['ReauthenticationFlow']

export type ProveContentProps = {
  flows: Flow[]
  // Already narrowed to a path on this site by the page.
  next: string
  // Set when a provider round trip came back without a proof.
  error?: string
  // Both full absolute URLs, computed server-side by the page - see AutoFormButton's own comment.
  providerAction: string
  callbackUrl: string
}

/** Every way the signed-in person can prove it is them, in the order the backend lists them. */
export function ProveContent({ flows, next, error, providerAction, callbackUrl }: ProveContentProps) {
  const { t } = useClientTranslation(['auth'])

  function renderFlow(flow: Flow) {
    switch (flow.id) {
      case 'reauthenticate':
        return <ProvePasswordForm key={flow.id} next={next} />
      case 'provider_reauthenticate':
        return (
          <div key={flow.id} className="flex flex-col gap-2">
            {flow.providers?.map((provider) => {
              const payload = { provider: provider.id, callback_url: callbackUrl }
              return (
                <AutoFormButton key={provider.id} variant="outline" action={providerAction} payload={payload}>
                  {t('auth:proveWithProvider', { provider: provider.name })}
                </AutoFormButton>
              )
            })}
          </div>
        )
      case 'mfa_reauthenticate':
        return <MfaChallengeForm key={flow.id} purpose="prove" types={flow.types ?? []} redirectTo={next} />
      case 'set_password_by_email':
        return <ProveSetPasswordByEmail key={flow.id} email={flow.email!} />
      // allauth adds flows of its own as apps are installed; one this page cannot offer yet is left out.
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-destructive text-sm">{t('auth:proveFailed')}</p>}
      {flows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('auth:proveNoWay')}</p>
      ) : (
        flows.map(renderFlow)
      )}
    </div>
  )
}
