'use client'

import { useRouter } from 'next/navigation'

import { useEffect } from 'react'

import { LOGIN_PATH, onSessionCleared } from '@/lib/sessionChannel'

// Closes two gaps in the X-Session-Cleared logout, which only fires in the tab that made the request.
// Not in the root layout, so /auth/** never revalidates a session it is establishing.
export function SessionWatcher() {
  const router = useRouter()

  // A sibling tab learned the session is dead. A hard navigation: a soft one keeps stale state.
  useEffect(
    () =>
      onSessionCleared(() => {
        window.location.href = LOGIN_PATH
      }),
    []
  )

  // A session killed server-side reaches no tab until one asks: on becoming visible, refresh()
  // re-runs the layout's gate, keeping state and scroll.
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
