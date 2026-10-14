import type { Translate } from '@/i18n/config'

/** What an OAuth scope lets an application do, in the reader's own words. Signing in is worded here, in
 *  their language; a permission an application may act with is worded by the backend, which declares
 *  them, and handed over as `described`. A scope worded nowhere is shown as it is, rather than hidden from
 *  the person deciding whether to allow it. */
export function scopeLabel(scope: string, t: Translate, described: Record<string, string> = {}): string {
  if (scope === 'openid') return t('auth:oauthScopeOpenid')
  if (scope === 'profile') return t('auth:oauthScopeProfile')
  if (scope === 'email') return t('auth:oauthScopeEmail')
  return described[scope] ?? scope
}

/** The backend's list of scopes an application may ask for, as `scopeLabel` takes it - none, when it could
 *  not be read. */
export function describedScopes(scopes: { name: string; label: string }[] | undefined): Record<string, string> {
  return Object.fromEntries((scopes ?? []).map((scope) => [scope.name, scope.label]))
}
