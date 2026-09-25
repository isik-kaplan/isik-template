import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'
import Cookies from 'js-cookie'

export type AuthApiOptions = {
  csrfCookieName?: string
  cookieHeader?: string
  baseFetch?: typeof fetch
}

export const SESSION_PATH = '/v0/browser/v1/auth/session'
// Not a client.POST() call like every other endpoint here - this one has to be a real HTML form
// submission (see components/app-auth/AutoFormButton.tsx) so the browser follows the 302 to the
// provider natively. A fetch()-based POST would just receive the redirect response as inert JSON.
export const PROVIDER_REDIRECT_PATH = '/v0/browser/v1/auth/provider/redirect'

function readCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

/** Typed client for the allauth headless API (auth-api/v0), served on the auth.<domain> host. */
export class AuthApi {
  private csrfCookieName: string
  private cookieHeader?: string
  private isServerSide: boolean
  private baseFetch: typeof fetch
  private baseUrl: string
  client: ReturnType<typeof createOpenApiClient<paths>>

  constructor(baseUrl: string, options: AuthApiOptions = {}) {
    const { csrfCookieName = 'csrftoken', cookieHeader, baseFetch } = options
    this.baseUrl = baseUrl
    this.csrfCookieName = csrfCookieName
    this.cookieHeader = cookieHeader
    this.isServerSide = 'cookieHeader' in options
    this.baseFetch = baseFetch ?? fetch.bind(globalThis)
    this.client = createOpenApiClient<paths>({ baseUrl, fetch: this.fetch })
  }

  private fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    let csrfToken = this.cookieHeader
      ? readCookie(this.cookieHeader, this.csrfCookieName)
      : Cookies.get(this.csrfCookieName)
    // A first-ever visitor has no csrftoken cookie yet - prime it with one harmless GET.
    if (!csrfToken && !this.isServerSide) {
      await this.baseFetch(`${this.baseUrl}${SESSION_PATH}`, { credentials: 'include' })
      csrfToken = Cookies.get(this.csrfCookieName)
    }
    if (csrfToken) headers.set('X-CSRFToken', csrfToken)
    if (this.cookieHeader) headers.set('Cookie', this.cookieHeader)
    return this.baseFetch(input, { ...init, headers, credentials: 'include' })
  }

  async session() {
    return this.client.GET('/v0/browser/v1/auth/session')
  }

  async isAuthenticated(): Promise<boolean> {
    const { data, error } = await this.session()
    // allauth: a 401 can still mean "authenticated but a flow is pending" - meta carries the
    // real answer either way, the HTTP status alone does not.
    return data?.meta.is_authenticated ?? error?.meta?.is_authenticated ?? false
  }

  async login(credentials: { username?: string; email?: string; password: string }) {
    return this.client.POST('/v0/browser/v1/auth/login', { body: credentials })
  }

  async signup(data: { username: string; email: string; password: string }) {
    return this.client.POST('/v0/browser/v1/auth/signup', { body: data })
  }

  async logout() {
    return this.client.DELETE('/v0/browser/v1/auth/session')
  }

  async requestPasswordReset(email: string) {
    return this.client.POST('/v0/browser/v1/auth/password/request', { body: { email } })
  }

  async resetPassword(key: string, password: string) {
    return this.client.POST('/v0/browser/v1/auth/password/reset', { body: { key, password } })
  }

  async changePassword(data: { current_password?: string; new_password: string }) {
    return this.client.POST('/v0/browser/v1/account/password/change', { body: data })
  }

  async verifyEmail(key: string) {
    return this.client.POST('/v0/browser/v1/auth/email/verify', { body: { key } })
  }

  async emails() {
    return this.client.GET('/v0/browser/v1/account/email')
  }

  async addEmail(email: string) {
    return this.client.POST('/v0/browser/v1/account/email', { body: { email } })
  }

  async removeEmail(email: string) {
    return this.client.DELETE('/v0/browser/v1/account/email', { body: { email } })
  }

  async makeEmailPrimary(email: string) {
    return this.client.PATCH('/v0/browser/v1/account/email', { body: { email, primary: true } })
  }

  async resendEmailVerification(email: string) {
    return this.client.PUT('/v0/browser/v1/account/email', { body: { email } })
  }

  async providers() {
    return this.client.GET('/v0/browser/v1/account/providers')
  }

  async disconnectProvider(provider: string, account: string) {
    return this.client.DELETE('/v0/browser/v1/account/providers', { body: { provider, account } })
  }

  async sessions() {
    return this.client.GET('/v0/browser/v1/auth/sessions')
  }

  // Ending the current session logs this browser out too, so the response can come back
  // unauthenticated - callers should re-check rather than assume a session list.
  async endSessions(sessions: number[]) {
    return this.client.DELETE('/v0/browser/v1/auth/sessions', { body: { sessions } })
  }

  // "Sign out everywhere else" is a filter over the list, not its own endpoint. Returns the list
  // untouched when this is the only session: allauth's `sessions` field is required, so an empty
  // array is a 400 rather than a no-op.
  async endOtherSessions() {
    const listed = await this.sessions()
    const others = (listed.data?.data ?? []).filter((session) => !session.is_current)
    if (others.length === 0) {
      return listed
    }
    return this.endSessions(others.map((session) => session.id))
  }

  async pendingProviderSignup() {
    return this.client.GET('/v0/browser/v1/auth/provider/signup')
  }

  async completeProviderSignup(data: { username: string; email: string; password?: string }) {
    return this.client.POST('/v0/browser/v1/auth/provider/signup', { body: data })
  }
}
