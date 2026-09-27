'use client'

import { type ReactNode, createContext, useContext } from 'react'

// language: the user's raw saved preference, absent when unset - allauth's own headless payload
// drops empty/None fields rather than serving "" (see apps/users/headless.py). Not the resolved
// language actually in effect - that's useLanguage()/'@/lib/LanguageContext', derived from this
// plus the browser's Accept-Language (see lib/resolveLanguage.ts).
export type Session = { user: { id: string; username: string; email: string; language?: string } } | null

const SessionContext = createContext<Session>(null)

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  return useContext(SessionContext)
}
