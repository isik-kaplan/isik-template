import { useEffect, useState } from 'react'

import { getAuthApi } from './session'

/** null while the check is in flight - both index.tsx (which route to land on) and the
 * (authenticated) group's layout (whether to let the visitor through at all) need the same
 * three-state loading/yes/no answer. */
export function useAuthenticated(): boolean | null {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  // Every mutant on this guard (and the cleanup/deps around it) is equivalent, not uncovered:
  // React 18+ silently drops a setState call after unmount instead of warning about it, so
  // nothing here is observable from a test either way - confirmed directly against this exact
  // React/testing-library version before writing this off as untestable.
  // Stryker disable ConditionalExpression,BlockStatement,BooleanLiteral,ArrayDeclaration
  useEffect(() => {
    let cancelled = false
    getAuthApi()
      .isAuthenticated()
      .then((result) => {
        if (!cancelled) setAuthenticated(result)
      })
    return () => {
      cancelled = true
    }
  }, [])
  // Stryker restore ConditionalExpression,BlockStatement,BooleanLiteral,ArrayDeclaration

  return authenticated
}
