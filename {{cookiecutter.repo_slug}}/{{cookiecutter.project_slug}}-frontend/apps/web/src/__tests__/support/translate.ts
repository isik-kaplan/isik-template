import type { Translate } from '@/i18n/config'

// Answers with the key it was handed, so a test asserts which key code reaches for rather than what
// English says today. Cast because a stub needs only the first of `Translate`'s overloads.
export const echoKeys = ((key: string) => key) as unknown as Translate
