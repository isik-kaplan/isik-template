import { headers } from 'next/headers'

import type { Api } from '@{{ cookiecutter.repo_slug }}/api'

import { createApi } from './apiClients'
import { requestOrigin } from './requestOrigin'

/** The main API as the visitor making this request, for a Server Component - the request's own
 *  cookies forwarded, since a server render has no browser cookie jar. */
export async function serverApi(): Promise<Api> {
  const requestHeaders = await headers()
  const origin = requestOrigin(requestHeaders).replace('://', '://api.')
  return createApi(origin, { cookieHeader: requestHeaders.get('cookie') ?? undefined })
}
