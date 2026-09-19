'use client'

import { useRouter } from 'next/navigation'

import { useEffect } from 'react'

import { LOGIN_PATH, onSessionCleared } from '@/lib/sessionChannel'

// Renders nothing - it exists to close the two gaps in the X-Session-Cleared auto-logout
// (lib/apiClients.ts), which is otherwise only reactive: it fires on the tab that happened to make
// the request. Mounted on authenticated surfaces (profile/layout.tsx), not the root layout, so
// /auth/** never revalidates a session it is in the middle of establishing.
export function SessionWatcher() {
  const router = useRouter()

  // Gap 1, live: a sibling tab already learned the session is dead. window.location.href, not
  // router.push - a soft navigation would re-render against the same dead session.
  useEffect(
    () =>
      onSessionCleared(() => {
        window.location.href = LOGIN_PATH
      }),
    // Stryker disable next-line ArrayDeclaration: equivalent mutant. React compares deps by
    // value (Object.is), so a fabricated string literal here is exactly as stable across
    // renders as the empty array - this effect still runs (and re-runs) the same either way.
    []
  )

  // Gap 2, not live but where it matters: a session killed server-side (password changed
  // elsewhere, expiry) reaches no tab until one asks. refresh() re-runs the layout's own gate,
  // which is what redirects - no endpoint knowledge needed here, so it works for every segment.
  // It preserves useState and scroll position, so a refocus never costs unsaved form input.
  useEffect(() => {
    function revalidateWhenVisible() {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }
    document.addEventListener('visibilitychange', revalidateWhenVisible)
    return () => document.removeEventListener('visibilitychange', revalidateWhenVisible)
  }, [router])

  return null
}
