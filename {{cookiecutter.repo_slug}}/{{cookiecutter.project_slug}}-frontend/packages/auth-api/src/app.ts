import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'

// Re-exported here rather than left to './index' - errors.ts has no browser dependency, but
// index.ts also re-exports client.ts (js-cookie), and this subpath exists specifically so a
// React Native bundle never has to pull that in.
export { extractAuthErrors, toFormErrors } from './errors'
export type { AllauthError, AllauthErrorResponse, FormErrors } from './errors'

export type AppAuthApiOptions = {
  // Caller-supplied rather than a fixed storage choice, so this package stays testable without a
  // React Native runtime - the mobile app wires these to expo-secure-store.
  getToken: () => string | null | Promise<string | null>
  setToken: (token: string | null) => void | Promise<void>
  baseFetch?: typeof fetch
}

const SESSION_TOKEN_HEADER = 'X-Session-Token'

/** Typed client for the allauth headless API's app client (auth-api/v0/app) - for React Native and
 * other non-browser consumers. Token-based, no cookies or CSRF: there's no ambient browser
 * credential here for CSRF to defend against, unlike AuthApi (client.ts), the browser counterpart
 * this deliberately does not share code with, so a React Native bundle never pulls in js-cookie. */
export class AppAuthApi {
  private getToken: AppAuthApiOptions['getToken']
  private setToken: AppAuthApiOptions['setToken']
  private baseFetch: typeof fetch
  client: ReturnType<typeof createOpenApiClient<paths>>

  constructor(baseUrl: string, options: AppAuthApiOptions) {
    this.getToken = options.getToken
    this.setToken = options.setToken
    this.baseFetch = options.baseFetch ?? fetch.bind(globalThis)
    this.client = createOpenApiClient<paths>({ baseUrl, fetch: this.fetch })
  }

  private fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    const token = await this.getToken()
    if (token) headers.set(SESSION_TOKEN_HEADER, token)
    const response = await this.baseFetch(input, { ...init, headers })
    // Every auth response carries the current token in its own meta, win or lose (allauth reissues
    // it on login/logout alike) - captured here once, so no caller has to remember to.
    await this.captureToken(response)
    return response
  }

  private async captureToken(response: Response): Promise<void> {
    let body: { meta?: { session_token?: string } } | undefined
    try {
      body = await response.clone().json()
    } catch {
      return
    }
    const token = body?.meta?.session_token
    if (token) await this.setToken(token)
  }

  async session() {
    return this.client.GET('/v0/app/v1/auth/session')
  }

  async isAuthenticated(): Promise<boolean> {
    const { data, error } = await this.session()
    // allauth: a 401 can still mean "authenticated but a flow is pending" - meta carries the
    // real answer either way, the HTTP status alone does not.
    return data?.meta.is_authenticated ?? error?.meta?.is_authenticated ?? false
  }

  async login(credentials: { username?: string; email?: string; password: string }) {
    return this.client.POST('/v0/app/v1/auth/login', { body: credentials })
  }

  async signup(data: { username: string; email: string; password: string }) {
    return this.client.POST('/v0/app/v1/auth/signup', { body: data })
  }

  async logout() {
    const result = await this.client.DELETE('/v0/app/v1/auth/session')
    // Explicit rather than relying on captureToken alone: a logout response may carry no fresh
    // session_token at all, which would otherwise leave the just-invalidated one in storage.
    await this.setToken(null)
    return result
  }
}
