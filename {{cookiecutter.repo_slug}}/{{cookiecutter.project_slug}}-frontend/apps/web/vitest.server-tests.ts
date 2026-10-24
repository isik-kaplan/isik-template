/**
 * Tests whose subject runs on a server, run under `node`: jsdom hands server code globals (`origin`,
 * `name`, `status`) production never has. A list, since Next colocates server and client components;
 * `npm run test:server-candidates` reports what may be missing.
 */
export const SERVER_TEST_FILES = [
  'src/__tests__/app/auth/callback-complete.test.tsx',
  'src/__tests__/app/manifest.test.ts',
  'src/__tests__/app/profile/page.test.tsx',
  'src/__tests__/config/public.test.ts',
  'src/__tests__/config/server.test.ts',
  'src/__tests__/i18n/index.test.ts',
  'src/__tests__/i18n/server.test.ts',
  'src/__tests__/lib/getSession.test.ts',
  'src/__tests__/lib/isLocalDevHost.test.ts',
  'src/__tests__/lib/serverApi.test.ts',
  'src/__tests__/proxy.test.ts',
  // Build tooling: it never meets a browser.
  'src/__tests__/scripts/mutation-shards.test.ts',
]
