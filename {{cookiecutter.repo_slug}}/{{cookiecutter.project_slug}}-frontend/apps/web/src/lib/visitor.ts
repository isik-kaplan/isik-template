import { SERVER_CONFIG } from '@/config/server'

// nginx's $client_ip, overriding whatever the client sent.
const CLIENT_IP_HEADER = 'x-client-ip'

/** A fetch nginx rate-limits against this render's visitor, not the frontend; plain without a key. */
export function visitorFetch(requestHeaders: Headers, baseFetch: typeof fetch = fetch.bind(globalThis)): typeof fetch {
  const key = SERVER_CONFIG.FRONTEND_KEY
  const visitor = requestHeaders.get(CLIENT_IP_HEADER)
  if (!key || !visitor) return baseFetch
  return (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('X-Frontend-Key', key)
    headers.set('X-Visitor-Ip', visitor)
    return baseFetch(input, { ...init, headers })
  }
}
