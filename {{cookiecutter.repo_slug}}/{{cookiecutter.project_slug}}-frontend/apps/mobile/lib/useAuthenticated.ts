import { useEffect, useState } from 'react'

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
      .isAuthenticated()
      .then((result) => {
        if (isMounted()) setAuthenticated(result)
      })
  }, [isMounted])
  // Stryker restore ArrayDeclaration,ConditionalExpression

  return authenticated
}
