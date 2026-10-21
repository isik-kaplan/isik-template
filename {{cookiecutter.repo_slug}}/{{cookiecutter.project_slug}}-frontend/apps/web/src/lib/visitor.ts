import { SERVER_CONFIG } from '@/config/server'

// nginx's answer to who a request is from (template.nginx.conf's $client_ip), set on every request
// it passes to the frontend, over whatever the client sent.
const CLIENT_IP_HEADER = 'x-client-ip'

/** A fetch made for the visitor this render is for. nginx counts it against them rather than against
 *  the frontend's own address, once the key shows it is the frontend asking - otherwise every
 *  visitor's page loads would share one rate limit. Without a key, or nobody to name, the plain fetch. */
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
