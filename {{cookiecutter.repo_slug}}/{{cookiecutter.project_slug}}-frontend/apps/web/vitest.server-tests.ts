/**
 * The test files whose subject runs on a server, so they run under `node` rather than jsdom.
 *
 * A list rather than a glob because no glob separates them: Next colocates server and client
 * components, so one `page.test.tsx` is a Server Component's and the next is not.
 *
 * What this buys is not speed. jsdom hands server code ambient globals it never has in production
 * (`origin`, `name`, `status`), so a Server Component reading one by mistake passes every suite.
 *
 * A new server-side test gets jsdom until it is listed, which is the one weakness of a list.
 * `npm run test:server-candidates` reports what would pass under `node` and is not here - read
 * rather than enforced, because plenty of browser code needs no DOM either.
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
  'src/__tests__/lib/nameFetchFailures.test.ts',
  'src/__tests__/lib/serverApi.test.ts',
  'src/__tests__/proxy.test.ts',
  // Build tooling rather than the app: it runs in node and never meets a browser.
  'src/__tests__/scripts/mutation-shards.test.ts',
]
