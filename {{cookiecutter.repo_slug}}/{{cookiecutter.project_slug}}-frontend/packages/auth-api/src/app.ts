import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'

// Re-exported here rather than left to './index' - errors.ts has no browser dependency, but
// index.ts also re-exports client.ts (js-cookie), and this subpath exists specifically so a
// React Native bundle never has to pull that in.
export { extractAuthErrors } from './errors'
export { needsReauthentication, pendingMfaTypes } from './flows'
export type { AllauthError, AllauthErrorResponse } from './errors'
export { hasPendingVerifyEmail } from './flows'

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

  // The second step of a login whose password was right, answered with a TOTP or recovery code.
  async completeMfaChallenge(code: string) {
    return this.client.POST('/v0/app/v1/auth/2fa/authenticate', { body: { code } })
  }

  async reauthenticate(password: string) {
    return this.client.POST('/v0/app/v1/auth/reauthenticate', { body: { password } })
  }

  async requestPasswordReset(email: string) {
    return this.client.POST('/v0/app/v1/auth/password/request', { body: { email } })
  }

  async resetPassword(key: string, password: string) {
    return this.client.POST('/v0/app/v1/auth/password/reset', { body: { key, password } })
  }

  async changePassword(data: { current_password?: string; new_password: string }) {
    return this.client.POST('/v0/app/v1/account/password/change', { body: data })
  }

  async verifyEmail(key: string) {
    return this.client.POST('/v0/app/v1/auth/email/verify', { body: { key } })
  }

  async emails() {
    return this.client.GET('/v0/app/v1/account/email')
  }

  async addEmail(email: string) {
    return this.client.POST('/v0/app/v1/account/email', { body: { email } })
  }

  async removeEmail(email: string) {
    return this.client.DELETE('/v0/app/v1/account/email', { body: { email } })
  }

  async makeEmailPrimary(email: string) {
    return this.client.PATCH('/v0/app/v1/account/email', { body: { email, primary: true } })
  }

  async resendEmailVerification(email: string) {
    return this.client.PUT('/v0/app/v1/account/email', { body: { email } })
  }

  async providers() {
    return this.client.GET('/v0/app/v1/account/providers')
  }

  async disconnectProvider(provider: string, account: string) {
    return this.client.DELETE('/v0/app/v1/account/providers', { body: { provider, account } })
  }

  async sessions() {
    return this.client.GET('/v0/app/v1/auth/sessions')
  }

  // Ending the current session logs this device out too, so the response can come back
  // unauthenticated - callers should re-check rather than assume a session list.
  async endSessions(sessions: number[]) {
    return this.client.DELETE('/v0/app/v1/auth/sessions', { body: { sessions } })
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
    return this.client.GET('/v0/app/v1/auth/provider/signup')
  }

  async completeProviderSignup(data: { username: string; email: string; password?: string }) {
    return this.client.POST('/v0/app/v1/auth/provider/signup', { body: data })
  }

  // Native SDK sign-in (Sign in with Apple / Google's own on-device flow) hands back a provider
  // ID token directly - no redirect, so nothing here needs a callback URL the way the browser's
  // auth/provider/redirect does.
  async loginWithProviderToken(provider: string, token: Record<string, unknown>) {
    return this.client.POST('/v0/app/v1/auth/provider/token', { body: { provider, process: 'login', token } })
  }
}
