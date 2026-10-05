/** Whether this page is served from a secure context (https, or localhost). Browser APIs such as
 *  WebAuthn are simply undefined outside one, which says "serve this over https" (see
 *  scripts/dev-tls.sh) rather than "this browser cannot". */
export function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext
}
