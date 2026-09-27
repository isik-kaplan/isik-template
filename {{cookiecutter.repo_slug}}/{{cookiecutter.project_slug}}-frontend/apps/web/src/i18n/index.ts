import { getLanguage } from '@/lib/getSession'

import type { Namespace } from './config'
import { useTranslation as serverUseTranslation } from './server'

// No client re-export here (see i18n/client.ts's own comment on useClientTranslation) - this
// file pulls in getSession.ts (next/headers), so anything reachable through it, including an
// unused re-export, poisons every Client Component that imports from here at all.

// Every server-side caller goes through here, not '@/i18n/server' directly - resolving the
// request's language once, here, is what lets every existing sUseTranslation(['ns']) call site
// pick up a signed-in user's preference (or the browser's) with no changes of its own.
export async function sUseTranslation(ns: Namespace[]) {
  const language = await getLanguage()
  return serverUseTranslation(ns, language)
}
