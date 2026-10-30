import { Api } from '@{{ cookiecutter.repo_slug }}/api'

import { apiOrigin } from './config'
import { signedInFetch } from './session'

// Lazy, so a missing EXPO_PUBLIC_API_ORIGIN throws on first use rather than at import.
let instance: Api | undefined
export function getApi(): Api {
  if (!instance) instance = new Api(apiOrigin(), { baseFetch: signedInFetch })
  return instance
}
