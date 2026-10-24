// getRequestOrigin()'s local-dev detector: the app is served on *.test, never localhost.
export function isLocalDevHost(host: string): boolean {
  return host.endsWith('.test') || host.endsWith('.localhost')
}
