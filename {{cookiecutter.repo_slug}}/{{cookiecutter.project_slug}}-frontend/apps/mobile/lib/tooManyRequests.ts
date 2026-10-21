import { retryAfterOf } from '@isikk/core'
import type { TFunction } from 'i18next'

/** What a person reads when the server refused for coming too often, or undefined for any other
 *  answer. Checked before anything else reads the answer: allauth's refusal carries no `errors`, which
 *  a screen would otherwise take for success. */
export function tooManyRequestsMessage(t: TFunction, response: Response | undefined): string | undefined {
  if (response?.status !== 429) return undefined
  const seconds = retryAfterOf(response)
  return seconds ? t('tooManyRequestsFor', { count: seconds }) : t('tooManyRequests')
}
