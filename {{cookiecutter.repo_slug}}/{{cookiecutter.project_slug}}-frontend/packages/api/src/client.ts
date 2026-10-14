import { createOpenApiClient } from './httpClient'
import type { paths } from './schema'
import type { ApiQuery } from './typeHelpers'
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

  // NonNullable: a PATCH body is optional in the generated document, so the request body type is too.
  async updateMe(data: NonNullable<paths['/v0/users/me/']['patch']['requestBody']>['content']['application/json']) {
    return this.client.PATCH('/v0/users/me/', { body: data })
  }

  async reauthenticationFlows() {
    return this.client.GET('/v0/users/me/reauthentication/')
  }

  async users(query?: ApiQuery<'/v0/users/'>) {
    return this.client.GET('/v0/users/', { params: { query } })
  }

  // Every permission there is to grant, with what it lets somebody do.
  async permissions() {
    return this.client.GET('/v0/users/permissions/')
  }

  async user(id: string) {
    return this.client.GET('/v0/users/{id}/', { params: { path: { id } } })
  }

  // Somebody else's account: whether they may sign in, their rank, and what they were granted.
  async updateUser(
    id: string,
    data: NonNullable<paths['/v0/users/{id}/']['patch']['requestBody']>['content']['application/json']
  ) {
    return this.client.PATCH('/v0/users/{id}/', { params: { path: { id } }, body: data })
  }

  async userHistory(id: string, query?: ApiQuery<'/v0/users/{id}/history/'>) {
    return this.client.GET('/v0/users/{id}/history/', { params: { path: { id }, query } })
  }

  // The applications the signed-in person registered to offer "Sign in with" this project.
  async oauthApplications() {
    return this.client.GET('/v0/oauth-applications/')
  }

  async registerOAuthApplication(
    data: paths['/v0/oauth-applications/']['post']['requestBody']['content']['application/json'],
    idempotencyKey: string
  ) {
    return this.client.POST('/v0/oauth-applications/', {
      body: data,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async oauthApplication(id: number) {
    return this.client.GET('/v0/oauth-applications/{id}/', { params: { path: { id } } })
  }

  async updateOAuthApplication(
    id: number,
    data: NonNullable<paths['/v0/oauth-applications/{id}/']['patch']['requestBody']>['content']['application/json']
  ) {
    return this.client.PATCH('/v0/oauth-applications/{id}/', { params: { path: { id } }, body: data })
  }

  async deleteOAuthApplication(id: number) {
    return this.client.DELETE('/v0/oauth-applications/{id}/', { params: { path: { id } } })
  }

  async disableOAuthApplication(id: number, idempotencyKey: string) {
    return this.client.POST('/v0/oauth-applications/{id}/disable/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async restoreOAuthApplication(id: number, idempotencyKey: string) {
    return this.client.POST('/v0/oauth-applications/{id}/restore/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async rotateOAuthApplicationSecret(id: number, revokeTokens: boolean, idempotencyKey: string) {
    return this.client.POST('/v0/oauth-applications/{id}/rotate-secret/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { revoke_tokens: revokeTokens },
    })
  }

  // What an application may ask to do on somebody's behalf, beyond signing them in.
  async delegatableScopes() {
    return this.client.GET('/v0/oauth-applications/delegatable-scopes/')
  }

  // Every application, for the superusers who approve and withdraw them.
  async oauthApplicationReviews(query?: ApiQuery<'/v0/oauth-application-reviews/'>) {
    return this.client.GET('/v0/oauth-application-reviews/', { params: { query } })
  }

  async oauthApplicationReview(id: number) {
    return this.client.GET('/v0/oauth-application-reviews/{id}/', { params: { path: { id } } })
  }

  async approveOAuthApplication(id: number, approvedScopes: string[], idempotencyKey: string) {
    return this.client.POST('/v0/oauth-application-reviews/{id}/approve/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { approved_scopes: approvedScopes },
    })
  }

  async withdrawOAuthApplication(id: number, idempotencyKey: string) {
    return this.client.POST('/v0/oauth-application-reviews/{id}/withdraw/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  // The applications the signed-in person let into their account.
  async authorizedApplications() {
    return this.client.GET('/v0/authorized-applications/')
  }

  async revokeAuthorizedApplication(id: number) {
    return this.client.DELETE('/v0/authorized-applications/{id}/', { params: { path: { id } } })
  }

  // A device - a command line - waiting for whoever enters the code it shows to let it in.
  async deviceAuthorization(userCode: string) {
    return this.client.GET('/v0/device-authorizations/{user_code}/', { params: { path: { user_code: userCode } } })
  }

  async approveDevice(userCode: string, idempotencyKey: string) {
    return this.client.POST('/v0/device-authorizations/{user_code}/approve/', {
      params: { path: { user_code: userCode }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async denyDevice(userCode: string, idempotencyKey: string) {
    return this.client.POST('/v0/device-authorizations/{user_code}/deny/', {
      params: { path: { user_code: userCode }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  // The tokens the signed-in person made for their own scripts.
  async personalAccessTokens() {
    return this.client.GET('/v0/personal-access-tokens/')
  }

  async makePersonalAccessToken(
    data: paths['/v0/personal-access-tokens/']['post']['requestBody']['content']['application/json'],
    idempotencyKey: string
  ) {
    return this.client.POST('/v0/personal-access-tokens/', {
      body: data,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async deletePersonalAccessToken(id: string) {
    return this.client.DELETE('/v0/personal-access-tokens/{id}/', { params: { path: { id } } })
  }

  // What the signed-in person may give a token: the delegatable permissions they hold.
  async personalAccessTokenScopes() {
    return this.client.GET('/v0/personal-access-tokens/scopes/')
  }
}
