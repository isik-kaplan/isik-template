import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'
import { createDjangoFetch } from '@isikk/core'

export type AuthApiOptions = {
  csrfCookieName?: string
  cookieHeader?: string
  baseFetch?: typeof fetch
}

export const SESSION_PATH = '/v0/browser/v1/auth/session'
// Submitted as a real HTML form, not fetch(), so the browser follows the 302 to the provider.
export const PROVIDER_REDIRECT_PATH = '/v0/browser/v1/auth/provider/redirect'
// Also a form submission: sends a signed-in person back to their provider to prove it is them.
export const PROVIDER_REAUTHENTICATE_PATH = '/v0/browser/v1/auth/provider/reauthenticate'

export class AuthApi {
  client: ReturnType<typeof createOpenApiClient<paths>>

  constructor(baseUrl: string, { csrfCookieName = 'csrftoken', cookieHeader, baseFetch }: AuthApiOptions = {}) {
    // A first-ever visitor has no csrftoken cookie yet, so the browser primes it with one harmless GET.
    const primeUrl = `${baseUrl}${SESSION_PATH}`
    const fetch = createDjangoFetch({ baseUrl, csrfCookieName, cookieHeader, baseFetch, primeUrl })
    this.client = createOpenApiClient<paths>({ baseUrl, fetch })
  }

  async session() {
    return this.client.GET('/v0/browser/v1/auth/session')
  }

  async isAuthenticated(): Promise<boolean> {
    const { data, error } = await this.session()
    // A 401 can still mean "authenticated, flow pending" - only meta is reliable.
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

  async reauthenticate(password: string) {
    return this.client.POST('/v0/browser/v1/auth/reauthenticate', { body: { password } })
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

  // Ending the current session too means the response can come back unauthenticated.
  async endSessions(sessions: number[]) {
    return this.client.DELETE('/v0/browser/v1/auth/sessions', { body: { sessions } })
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

  async config() {
    return this.client.GET('/v0/browser/v1/config')
  }

  async completeMfaChallenge(code: string) {
    return this.client.POST('/v0/browser/v1/auth/2fa/authenticate', { body: { code } })
  }

  async webauthnChallengeOptions() {
    return this.client.GET('/v0/browser/v1/auth/webauthn/authenticate')
  }

  async completeWebauthnChallenge(credential: Record<string, unknown>) {
    return this.client.POST('/v0/browser/v1/auth/webauthn/authenticate', { body: { credential } })
  }

  async reauthenticateWithCode(code: string) {
    return this.client.POST('/v0/browser/v1/auth/2fa/reauthenticate', { body: { code } })
  }

  async webauthnReauthenticationOptions() {
    return this.client.GET('/v0/browser/v1/auth/webauthn/reauthenticate')
  }

  async reauthenticateWithWebauthn(credential: Record<string, unknown>) {
    return this.client.POST('/v0/browser/v1/auth/webauthn/reauthenticate', { body: { credential } })
  }

  async authenticators() {
    return this.client.GET('/v0/browser/v1/account/authenticators')
  }

  // A 404 means no TOTP yet, and carries a fresh secret to enroll.
  async totpStatus() {
    return this.client.GET('/v0/browser/v1/account/authenticators/totp')
  }

  async activateTotp(code: string) {
    return this.client.POST('/v0/browser/v1/account/authenticators/totp', { body: { code } })
  }

  async deactivateTotp() {
    return this.client.DELETE('/v0/browser/v1/account/authenticators/totp')
  }

  async recoveryCodes() {
    return this.client.GET('/v0/browser/v1/account/authenticators/recovery-codes')
  }

  async regenerateRecoveryCodes() {
    return this.client.POST('/v0/browser/v1/account/authenticators/recovery-codes')
  }

  async webauthnCreationOptions() {
    return this.client.GET('/v0/browser/v1/account/authenticators/webauthn')
  }

  async addWebauthn(credential: Record<string, unknown>, name?: string) {
    return this.client.POST('/v0/browser/v1/account/authenticators/webauthn', { body: { credential, name } })
  }

  async removeWebauthn(authenticators: number[]) {
    return this.client.DELETE('/v0/browser/v1/account/authenticators/webauthn', { body: { authenticators } })
  }

  async pendingProviderSignup() {
    return this.client.GET('/v0/browser/v1/auth/provider/signup')
  }

  async completeProviderSignup(data: { username: string; email: string; password?: string }) {
    return this.client.POST('/v0/browser/v1/auth/provider/signup', { body: data })
  }
}
