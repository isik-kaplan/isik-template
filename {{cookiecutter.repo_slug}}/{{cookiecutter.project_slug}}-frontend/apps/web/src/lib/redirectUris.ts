/** Redirect URIs as somebody types them, one per line, into the list the API takes. Blank lines are
 *  nothing; the backend says which of the rest it cannot return to. */
export function redirectUrisFrom(typed: string): string[] {
  return typed
    .split('\n')
    .map((uri) => uri.trim())
    .filter(Boolean)
}
