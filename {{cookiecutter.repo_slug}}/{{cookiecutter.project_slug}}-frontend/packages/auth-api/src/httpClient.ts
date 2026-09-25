import openapiFetchDefault from 'openapi-fetch'

// tsup's CJS build (dist/*.cjs) doesn't unwrap openapi-fetch's default export correctly for
// require()-based consumers (Jest, plain Node - anything that isn't Vite/vitest's own ESM-native
// resolution, which is why this went unnoticed until something other than vitest first required
// this package): esbuild's CJS interop helper wraps the *whole* openapi-fetch module as .default
// instead of the function openapi-fetch itself already put there, so the real function ends up
// one level deeper than a plain default import expects. Works for either shape, whichever a given
// bundler/consumer actually produces.
export const createOpenApiClient = ((openapiFetchDefault as unknown as { default?: unknown }).default ??
  openapiFetchDefault) as typeof openapiFetchDefault
