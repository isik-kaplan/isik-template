/** One redirect URI per line, blank lines dropped; the backend validates the rest. */
export function redirectUrisFrom(typed: string): string[] {
  return typed
    .split('\n')
    .map((uri) => uri.trim())
    .filter(Boolean)
}
