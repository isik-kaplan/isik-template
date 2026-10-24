import openapiFetchDefault from 'openapi-fetch'

// Under require() (Jest, Node) esbuild's CJS interop nests the real function one .default deeper.
export const createOpenApiClient = ((openapiFetchDefault as unknown as { default?: unknown }).default ??
  openapiFetchDefault) as typeof openapiFetchDefault
