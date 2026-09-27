import { useEffect, useState } from 'react'

import { setLanguage } from './i18n'
import { getAuthApi } from './session'
import { useIsMounted } from '@isikk/core/hooks'

/** null while the check is in flight - both index.tsx (which route to land on) and the
 * (authenticated) group's layout (whether to let the visitor through at all) need the same
 * three-state loading/yes/no answer. */
export function useAuthenticated(): boolean | null {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const isMounted = useIsMounted()

  // isMounted is referentially stable (its own useCallback never changes it), so this effect's
  // deps array is equivalent to [] either way - and see @isikk/core/hooks' own useIsMounted for
  // why the guard below is equivalent too.
  // Stryker disable ArrayDeclaration,ConditionalExpression
  useEffect(() => {
    getAuthApi()
      .session()
      .then(({ data, error }) => {
        if (!isMounted()) return
        setAuthenticated(data?.meta.is_authenticated ?? error?.meta?.is_authenticated ?? false)
        // A signed-in user's saved preference overrides the device locale i18n.ts already
        // started with - nothing to do for a user with no preference set (language is absent).
        if (data?.data?.user.language) setLanguage(data.data.user.language)
      })
  }, [isMounted])
  // Stryker restore ArrayDeclaration,ConditionalExpression

  return authenticated
}
