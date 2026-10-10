/**
 * Test files that would pass with no DOM and are not on the server list.
 *
 * The one weakness of `vitest.server-tests.ts` being a list is that a new server-side test gets
 * jsdom until somebody adds it, which is silent. This makes it loud on demand: it runs everything
 * not on the list under `node` and reports what did not need a DOM after all.
 *
 * Through a generated config rather than `--environment node`: that flag does not override a
 * project's own `environment`, so it would report every file as passing.
 *
 * Reported rather than enforced. A file can pass without a DOM and still be browser code, so the
 * answer is a person reading the list, not a gate failing the build.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const REPORT = '.vitest-server-candidates.json'
const CONFIG = 'vitest.candidates.generated.mts'

writeFileSync(
  CONFIG,
  `import { configDefaults, defineConfig } from 'vitest/config'\n` +
    `import { sharedPlugins, sharedResolve } from './vitest.config.mts'\n` +
    `import { SERVER_TEST_FILES } from './vitest.server-tests'\n\n` +
    `export default defineConfig({\n` +
    `  plugins: sharedPlugins,\n` +
    `  resolve: sharedResolve,\n` +
    `  test: {\n` +
    `    environment: 'node',\n` +
    `    setupFiles: ['./vitest.setup.ts'],\n` +
    `    server: { deps: { inline: ['@isikk/core'] } },\n` +
    `    exclude: [...configDefaults.exclude, ...SERVER_TEST_FILES],\n` +
    `  },\n` +
    `})\n`
)

try {
  execFileSync('npx', ['vitest', 'run', '--config', CONFIG, '--reporter=json', `--outputFile=${REPORT}`], {
    stdio: 'ignore',
  })
} catch {
  // A non-zero exit is the expected case: most of these need a DOM. The report is what matters.
}

let results = []
try {
  results = JSON.parse(readFileSync(REPORT, 'utf8')).testResults ?? []
} finally {
  rmSync(REPORT, { force: true })
  rmSync(CONFIG, { force: true })
}

const candidates = results
  .filter((file) => file.status === 'passed')
  .map((file) => file.name.split('/apps/web/')[1])
  .sort()

if (candidates.length === 0) {
  console.log('No candidates: every test that can run without a DOM is already on the server list.')
} else {
  console.log(`${candidates.length} test file(s) pass with no DOM and are not on the server list:\n`)
  for (const name of candidates) console.log(`  ${name}`)
  console.log('\nAdd the ones whose subject runs on a server to vitest.server-tests.ts.')
}
