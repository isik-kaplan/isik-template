'use client'

import { type ReactNode, createContext, useContext } from 'react'

export type Session = { user: { id: string; username: string; email: string } } | null

const SessionContext = createContext<Session>(null)

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  return useContext(SessionContext)
}
