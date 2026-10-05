// undici's bare `fetch failed` carries only its own frames, so Next hashes every server-side network
// failure to one digest. The digest is a hash of message + stack, so naming the call separates them.
// The original stays on `cause`, where undici puts the real reason.
export function nameFetchFailures(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await baseFetch(input, init)
    } catch (cause) {
      const method = (input instanceof Request ? input.method : init?.method) ?? 'GET'
      const url = input instanceof Request ? input.url : String(input)
      const code = (cause as { cause?: { code?: string } } | undefined)?.cause?.code
      throw Object.assign(new Error(`fetch failed: ${method} ${url}${code ? ` (${code})` : ''}`), { cause })
    }
  }
}
