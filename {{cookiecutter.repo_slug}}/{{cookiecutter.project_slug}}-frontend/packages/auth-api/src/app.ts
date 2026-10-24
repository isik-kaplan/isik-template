import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'

// Re-exported here, not via './index', which pulls in the browser client.
export {
  errorsOf,
  hasPendingVerifyEmail,
  needsReauthentication,
  pendingFlow,
  pendingMfaTypes,
} from '@isikk/core/allauth'
export type { AllauthError, AllauthErrorResponse } from '@isikk/core/allauth'

export type AppAuthApiOptions = {
  // Caller-supplied so this package stays testable without a React Native runtime.
  getToken: () => string | null | Promise<string | null>
  setToken: (token: string | null) => void | Promise<void>
  baseFetch?: typeof fetch
}

const SESSION_TOKEN_HEADER = 'X-Session-Token'

/** allauth's token-based app client for non-browser consumers. No CSRF: there is no ambient credential to forge. */
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
    // allauth may reissue the token on any response, success or not.
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
    // A 401 can still mean "authenticated, flow pending" - only meta is reliable.
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
    // A logout response may carry no new token, which would leave the dead one stored.
    await this.setToken(null)
    return result
  }

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

  // Ending the current session too means the response can come back unauthenticated.
  async endSessions(sessions: number[]) {
    return this.client.DELETE('/v0/app/v1/auth/sessions', { body: { sessions } })
  }

  // An empty `sessions` array is a 400, not a no-op, so the lone-session case returns the list.
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

  async loginWithProviderToken(provider: string, token: Record<string, unknown>) {
    return this.client.POST('/v0/app/v1/auth/provider/token', { body: { provider, process: 'login', token } })
  }
}
