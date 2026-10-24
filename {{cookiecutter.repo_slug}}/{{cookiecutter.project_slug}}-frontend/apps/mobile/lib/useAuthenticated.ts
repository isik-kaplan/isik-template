import { useEffect, useState } from 'react'

import { setLanguage } from './i18n'
import { getAuthApi } from './session'
import { useIsMounted } from '@isikk/core/hooks'

/** null while the check is in flight. */
export function useAuthenticated(): boolean | null {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .session()
      .then(({ data, error }) => {
        if (!isMounted()) return
        setAuthenticated(data?.meta.is_authenticated ?? error?.meta?.is_authenticated ?? false)
        if (data?.data?.user.language) setLanguage(data.data.user.language)
      })
  }, [isMounted])

  return authenticated
}
