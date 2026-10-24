import { getLanguage } from '@/lib/getSession'

import type { Namespace } from './config'
import { useTranslation as serverUseTranslation } from './server'

// No client re-export: this file reaches next/headers, which poisons any Client Component importing it.

// Server callers go through here, not '@/i18n/server', so each gets the request's language.
export async function sUseTranslation(ns: Namespace[]) {
  const language = await getLanguage()
  return serverUseTranslation(ns, language)
}
