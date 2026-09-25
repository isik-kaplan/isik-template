import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'
import Cookies from 'js-cookie'

export type ApiOptions = {
  csrfCookieName?: string
  // Set only for server-side calls (Server Components/Actions have no browser cookie jar) - the
  // incoming request's raw Cookie header is forwarded verbatim instead.
  cookieHeader?: string
  baseFetch?: typeof fetch
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export class Api {
  private csrfCookieName: string
  private cookieHeader?: string
  private baseFetch: typeof fetch
  client: ReturnType<typeof createOpenApiClient<paths>>

  constructor(baseUrl: string, { csrfCookieName = 'csrftoken', cookieHeader, baseFetch }: ApiOptions = {}) {
    this.csrfCookieName = csrfCookieName
    this.cookieHeader = cookieHeader
    // .bind(globalThis), not a bare reference - calling the browser's native fetch off of some
    // other object throws "Illegal invocation".
    this.baseFetch = baseFetch ?? fetch.bind(globalThis)
    this.client = createOpenApiClient<paths>({ baseUrl, fetch: this.fetch })
  }

  private fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const csrfToken = this.cookieHeader
      ? readCookie(this.cookieHeader, this.csrfCookieName)
      : Cookies.get(this.csrfCookieName)
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    if (csrfToken) headers.set('X-CSRFToken', csrfToken)
    if (this.cookieHeader) headers.set('Cookie', this.cookieHeader)
    return this.baseFetch(input, { ...init, headers, credentials: 'include' })
  }

  async me() {
    return this.client.GET('/v0/users/me/')
  }

  async users(params?: { page?: number; page_size?: number }) {
    return this.client.GET('/v0/users/', { params: { query: params } })
  }
}
