'use client'

import { type ReactNode, createContext, useContext } from 'react'

// language: the saved preference, absent when unset. The language in effect is useLanguage()'s.
// display: allauth's label for the account; username is absent for somebody with no handle.
export type Session = {
  user: { id: string; display: string; username?: string; email: string; language?: string }
} | null

const SessionContext = createContext<Session>(null)

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  return useContext(SessionContext)
}
