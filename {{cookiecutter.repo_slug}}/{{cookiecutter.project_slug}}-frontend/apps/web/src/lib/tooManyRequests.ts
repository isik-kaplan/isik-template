import { redirect } from 'next/navigation'

export const TOO_MANY_REQUESTS_PATH = '/too-many-requests'

// Set by proxy.ts on every page request: a Server Component is told nothing else about which page it renders.
export const PATH_HEADER = 'x-page-path'

/** A fetch for a Server Component that sends the visitor to TOO_MANY_REQUESTS_PATH when the API
 *  refuses to answer for now, offering the page they were on once they have waited. The page would
 *  otherwise render what it was refused as empty, or as not there at all. */
export function tooManyRequestsPage(requestHeaders: Headers, baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init)
    if (response.status === 429) {
      const page = requestHeaders.get(PATH_HEADER)
      redirect(page ? `${TOO_MANY_REQUESTS_PATH}?next=${encodeURIComponent(page)}` : TOO_MANY_REQUESTS_PATH)
    }
    return response
  }
}
