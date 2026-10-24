import { headers } from 'next/headers'

import type { Api } from '@{{ cookiecutter.repo_slug }}/api'

import { createApi } from './apiClients'
import { requestOrigin } from './requestOrigin'
import { tooManyRequestsPage } from './tooManyRequests'
import { visitorFetch } from './visitor'

/** The main API as this request's visitor, with their cookies forwarded; a 429 leaves the page. */
export async function serverApi(): Promise<Api> {
  const requestHeaders = await headers()
  const origin = requestOrigin(requestHeaders).replace('://', '://api.')
  return createApi(origin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: tooManyRequestsPage(requestHeaders, visitorFetch(requestHeaders)),
  })
}
