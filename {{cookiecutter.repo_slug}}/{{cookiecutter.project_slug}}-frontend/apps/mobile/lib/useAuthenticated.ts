import { useEffect, useState } from 'react'

import { setLanguage } from './i18n'
import { getAuthApi, holdsSession } from './session'
import { useIsMounted } from '@isikk/core/hooks'

/** null while the check is in flight. */
export function useAuthenticated(): boolean | null {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .session()
      .then(async ({ data, error }) => {
        // Unreachable, with no answer either way: a stored session counts, so the app opens offline.
        const answer = data?.meta.is_authenticated ?? error?.meta?.is_authenticated ?? (await holdsSession())
        if (!isMounted()) return
        setAuthenticated(answer)
        if (data?.data?.user.language) setLanguage(data.data.user.language)
      })
  }, [isMounted])

  return authenticated
}
