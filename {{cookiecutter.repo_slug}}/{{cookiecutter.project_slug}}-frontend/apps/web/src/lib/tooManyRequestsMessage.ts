import { i18next } from '@/i18n/client'

/** What a person reads when a request was refused for coming too often: how long to wait, when the
 *  refusal said (the API's throttles and nginx do; allauth's never does). In the page's language at
 *  the moment it is asked for, which the client instance follows (useClientTranslation). */
export function tooManyRequestsMessage(seconds: number | null): string {
  return seconds ? i18next.t('common:tooManyRequestsFor', { count: seconds }) : i18next.t('common:tooManyRequests')
}
