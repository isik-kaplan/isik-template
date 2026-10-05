type Flow = { id?: string; is_pending?: boolean; types?: string[] }

function flowsOf(error: unknown): Flow[] {
  if (!error || typeof error !== 'object' || !('data' in error)) return []
  return (error as { data?: { flows?: Flow[] } }).data?.flows ?? []
}

// allauth answers a request it cannot complete yet with a 401 naming the flow still owed - success so
// far, not a refusal.
function pendingFlow(error: unknown, id: string): Flow | undefined {
  return flowsOf(error).find((candidate) => candidate.id === id && candidate.is_pending)
}

// After a signup, and on a login whose address is still unconfirmed - allauth mails a fresh link as it
// refuses that login, so this is a step owed rather than a wrong password.
export function hasPendingVerifyEmail(error: unknown): boolean {
  return pendingFlow(error, 'verify_email') !== undefined
}

/**
 * The factors a login whose password was right still owes, or null when no challenge is pending.
 * allauth answers that login with a 401 naming the flow - success so far, not a wrong password.
 */
export function pendingMfaTypes(error: unknown): string[] | null {
  const flow = pendingFlow(error, 'mfa_authenticate')
  return flow ? (flow.types ?? []) : null
}

/**
 * Changing a factor needs a recent login. Past allauth's reauthentication timeout a write comes back
 * 401 offering the reauthenticate flows instead of doing anything.
 */
export function needsReauthentication(error: unknown): boolean {
  return flowsOf(error).some((flow) => flow.id === 'reauthenticate' || flow.id === 'mfa_reauthenticate')
}
