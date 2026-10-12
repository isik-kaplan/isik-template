import type { Translate } from '@/i18n/config'

/** What an OAuth scope lets an application see, in the reader's own words. A scope this project does not
 *  word is shown as it is, rather than hidden from the person deciding whether to allow it. */
export function scopeLabel(scope: string, t: Translate): string {
  if (scope === 'openid') return t('auth:oauthScopeOpenid')
  if (scope === 'profile') return t('auth:oauthScopeProfile')
  if (scope === 'email') return t('auth:oauthScopeEmail')
  return scope
}
