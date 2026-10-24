import type { Translate } from '@/i18n/config'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

export type Grant = ApiType<'ApplicationAuthorizationGrantType'>

// RFC 8628's name for the grant a command line uses: it shows a code, and somebody enters it on /device.
export const DEVICE_GRANT: Grant = 'urn:ietf:params:oauth:grant-type:device_code'

/** Spelled out per grant: i18next-parser only finds a literal key. */
export function grantLabel(grant: Grant, t: Translate): string {
  const labels: Record<Grant, string> = {
    'authorization-code': t('auth:applicationGrantRedirect'),
    'urn:ietf:params:oauth:grant-type:device_code': t('auth:applicationGrantDevice'),
  }
  return labels[grant]
}
