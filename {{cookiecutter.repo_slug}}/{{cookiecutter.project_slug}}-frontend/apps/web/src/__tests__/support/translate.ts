import type { Translate } from '@/i18n/config'

// Answers with the key, so tests assert keys rather than English. Cast: a stub needs one overload.
export const echoKeys = ((key: string) => key) as unknown as Translate
