import { createOpenApiClient } from './httpClient'
import type { components, paths } from './schema'
import type { ApiQuery } from './typeHelpers'
import { type IdempotencyKey, type Keyed, type Versioned, createDjangoFetch } from '@isikk/core'

export type ApiOptions = {
  csrfCookieName?: string
  // Server-side only: the incoming request's Cookie header, forwarded verbatim.
  cookieHeader?: string
  baseFetch?: typeof fetch
}

export type WriteHeaders = { 'If-Match'?: string; 'Idempotency-Key'?: string }

/** Forgetting the version, or passing one that may be undefined, is a type error rather than a 428. */
export type VersionedHeaders = WriteHeaders & Versioned

/** A PATCH or DELETE needs both: a forgotten key is a type error too, not a 428. */
export type VersionedKeyedHeaders = VersionedHeaders & Keyed

// Only a deliberate `null` leaves If-Match out, which the backend refuses with a 428.
function versioned(headers: VersionedHeaders) {
  return headers as VersionedHeaders & { 'If-Match': string }
}

function versionedKeyed(headers: VersionedKeyedHeaders) {
  return headers as VersionedKeyedHeaders & { 'If-Match': string; 'Idempotency-Key': string }
}

export class Api {
  client: ReturnType<typeof createOpenApiClient<paths>>

  constructor(baseUrl: string, { csrfCookieName = 'csrftoken', cookieHeader, baseFetch }: ApiOptions = {}) {
    const fetch = createDjangoFetch({ baseUrl, csrfCookieName, cookieHeader, baseFetch })
    this.client = createOpenApiClient<paths>({ baseUrl, fetch })
  }

  async me() {
    return this.client.GET('/v0/users/me/')
  }

  // NonNullable: a PATCH body is optional in the generated document.
  async updateMe(
    data: NonNullable<paths['/v0/users/me/']['patch']['requestBody']>['content']['application/json'],
    headers: VersionedKeyedHeaders
  ) {
    return this.client.PATCH('/v0/users/me/', { body: data, params: { header: versionedKeyed(headers) } })
  }

  async reauthenticationFlows() {
    return this.client.GET('/v0/users/me/reauthentication/')
  }

  async users(query?: ApiQuery<'/v0/users/'>) {
    return this.client.GET('/v0/users/', { params: { query } })
  }

  async permissions() {
    return this.client.GET('/v0/users/permissions/')
  }

  async user(id: string) {
    return this.client.GET('/v0/users/{id}/', { params: { path: { id } } })
  }

  async updateUser(
    id: string,
    data: NonNullable<paths['/v0/users/{id}/']['patch']['requestBody']>['content']['application/json'],
    headers: VersionedKeyedHeaders
  ) {
    return this.client.PATCH('/v0/users/{id}/', {
      params: { path: { id }, header: versionedKeyed(headers) },
      body: data,
    })
  }

  async userHistory(id: string, query?: ApiQuery<'/v0/users/{id}/history/'>) {
    return this.client.GET('/v0/users/{id}/history/', { params: { path: { id }, query } })
  }

  async oauthApplications() {
    return this.client.GET('/v0/oauth-applications/')
  }

  async registerOAuthApplication(
    data: paths['/v0/oauth-applications/']['post']['requestBody']['content']['application/json'],
    idempotencyKey: IdempotencyKey
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
    data: NonNullable<paths['/v0/oauth-applications/{id}/']['patch']['requestBody']>['content']['application/json'],
    headers: VersionedKeyedHeaders
  ) {
    return this.client.PATCH('/v0/oauth-applications/{id}/', {
      params: { path: { id }, header: versionedKeyed(headers) },
      body: data,
    })
  }

  async deleteOAuthApplication(id: number, headers: VersionedKeyedHeaders) {
    return this.client.DELETE('/v0/oauth-applications/{id}/', {
      params: { path: { id }, header: versionedKeyed(headers) },
    })
  }

  async disableOAuthApplication(id: number, idempotencyKey: IdempotencyKey) {
    return this.client.POST('/v0/oauth-applications/{id}/disable/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async restoreOAuthApplication(id: number, idempotencyKey: IdempotencyKey) {
    return this.client.POST('/v0/oauth-applications/{id}/restore/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async rotateOAuthApplicationSecret(id: number, revokeTokens: boolean, idempotencyKey: IdempotencyKey) {
    return this.client.POST('/v0/oauth-applications/{id}/rotate-secret/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { revoke_tokens: revokeTokens },
    })
  }

  async delegatableScopes() {
    return this.client.GET('/v0/oauth-applications/delegatable-scopes/')
  }

  async oauthApplicationReviews(query?: ApiQuery<'/v0/oauth-application-reviews/'>) {
    return this.client.GET('/v0/oauth-application-reviews/', { params: { query } })
  }

  async oauthApplicationReview(id: number) {
    return this.client.GET('/v0/oauth-application-reviews/{id}/', { params: { path: { id } } })
  }

  async approveOAuthApplication(
    id: number,
    approvedScopes: string[],
    idempotencyKey: IdempotencyKey,
    headers: VersionedHeaders
  ) {
    return this.client.POST('/v0/oauth-application-reviews/{id}/approve/', {
      params: { path: { id }, header: { ...versioned(headers), 'Idempotency-Key': idempotencyKey } },
      body: { approved_scopes: approvedScopes },
    })
  }

  async withdrawOAuthApplication(id: number, idempotencyKey: IdempotencyKey) {
    return this.client.POST('/v0/oauth-application-reviews/{id}/withdraw/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async authorizedApplications() {
    return this.client.GET('/v0/authorized-applications/')
  }

  async revokeAuthorizedApplication(id: number, idempotencyKey: IdempotencyKey) {
    return this.client.DELETE('/v0/authorized-applications/{id}/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async deviceAuthorization(userCode: string) {
    return this.client.GET('/v0/device-authorizations/{user_code}/', { params: { path: { user_code: userCode } } })
  }

  async approveDevice(userCode: string, idempotencyKey: IdempotencyKey) {
    return this.client.POST('/v0/device-authorizations/{user_code}/approve/', {
      params: { path: { user_code: userCode }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async denyDevice(userCode: string, idempotencyKey: IdempotencyKey) {
    return this.client.POST('/v0/device-authorizations/{user_code}/deny/', {
      params: { path: { user_code: userCode }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async personalAccessTokens() {
    return this.client.GET('/v0/personal-access-tokens/')
  }

  async makePersonalAccessToken(
    data: paths['/v0/personal-access-tokens/']['post']['requestBody']['content']['application/json'],
    idempotencyKey: IdempotencyKey
  ) {
    return this.client.POST('/v0/personal-access-tokens/', {
      body: data,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async deletePersonalAccessToken(id: string, idempotencyKey: IdempotencyKey) {
    return this.client.DELETE('/v0/personal-access-tokens/{id}/', {
      params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
    })
  }

  async personalAccessTokenScopes() {
    return this.client.GET('/v0/personal-access-tokens/scopes/')
  }

  async notifications(query: { unread?: boolean; page?: number } = {}) {
    return this.client.GET('/v0/notifications/inbox/', { params: { query } })
  }

  async markNotificationRead(id: string) {
    return this.client.POST('/v0/notifications/inbox/{id}/read/', { params: { path: { id } } })
  }

  async markAllNotificationsRead() {
    return this.client.POST('/v0/notifications/inbox/read-all/')
  }

  /** Every kind there is: `may_change` says which a person chooses, `forced` which staff chose for them. */
  async notificationKinds() {
    return this.client.GET('/v0/notifications/kinds/')
  }

  async chooseNotifications(kind: string, enabled: boolean) {
    return this.client.POST('/v0/notifications/subscriptions/', { body: { kind, enabled } })
  }

  /** The phones this person's notifications are pushed to. */
  async devices() {
    return this.client.GET('/v0/notifications/devices/')
  }

  /** Needs no key: registering a token again moves it to the caller, so an app sends it at every start. */
  async registerDevice(body: components['schemas']['DeviceRequest']) {
    return this.client.POST('/v0/notifications/devices/', { body })
  }

  async forgetDevice(id: string) {
    return this.client.DELETE('/v0/notifications/devices/{id}/', { params: { path: { id } } })
  }

  async features() {
    return this.client.GET('/v0/features/')
  }

  /** The response's ETag is the version every change names. */
  async settings() {
    return this.client.GET('/v0/settings/')
  }

  async changeSetting(
    name: string,
    body: components['schemas']['PatchedSettingValueRequest'],
    headers: VersionedHeaders
  ) {
    return this.client.PATCH('/v0/settings/{name}/', { params: { path: { name }, header: versioned(headers) }, body })
  }
}
