// Passed to @isikk/core's getRequestOrigin() as its local-dev-host detector - the app itself is
// never served at localhost (see the repo README), so this only needs to recognize the *.test
// domain convention this template's post-gen message suggests, not localhost specifically.
export function isLocalDevHost(host: string): boolean {
  return host.endsWith('.test') || host.endsWith('.localhost')
}
