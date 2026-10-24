import { i18next } from '@/i18n/client'

/** The rate-limit message, with the wait when the refusal says (allauth's never does). In the page's
 *  language at the moment it is asked for. */
export function tooManyRequestsMessage(seconds: number | null): string {
  return seconds ? i18next.t('common:tooManyRequestsFor', { count: seconds }) : i18next.t('common:tooManyRequests')
}
