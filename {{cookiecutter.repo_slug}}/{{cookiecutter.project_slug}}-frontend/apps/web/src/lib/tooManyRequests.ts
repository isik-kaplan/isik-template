import { redirect } from 'next/navigation'

export const TOO_MANY_REQUESTS_PATH = '/too-many-requests'

// Set by proxy.ts: a Server Component is told nothing else about which page it renders.
export const PATH_HEADER = 'x-page-path'

/** On a 429, sends the visitor to TOO_MANY_REQUESTS_PATH rather than rendering the page empty. */
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
