import type { Translate } from '@/i18n/config'

/** A scope in words: sign-in scopes here, permissions from the backend as `described`; anything else
 *  shown as is rather than hidden from the person deciding. */
export function scopeLabel(scope: string, t: Translate, described: Record<string, string> = {}): string {
  if (scope === 'openid') return t('auth:oauthScopeOpenid')
  if (scope === 'profile') return t('auth:oauthScopeProfile')
  if (scope === 'email') return t('auth:oauthScopeEmail')
  return described[scope] ?? scope
}

/** The backend's scope list for `scopeLabel`; none when unreadable. */
export function describedScopes(scopes: { name: string; label: string }[] | undefined): Record<string, string> {
  return Object.fromEntries((scopes ?? []).map((scope) => [scope.name, scope.label]))
}
