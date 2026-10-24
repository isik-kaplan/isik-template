import { retryAfterOf } from '@isikk/core'
import type { TFunction } from 'i18next'

/** Check this first: allauth's 429 carries no `errors`, which a screen would otherwise take for success. */
export function tooManyRequestsMessage(t: TFunction, response: Response | undefined): string | undefined {
  if (response?.status !== 429) return undefined
  const seconds = retryAfterOf(response)
  return seconds ? t('tooManyRequestsFor', { count: seconds }) : t('tooManyRequests')
}
