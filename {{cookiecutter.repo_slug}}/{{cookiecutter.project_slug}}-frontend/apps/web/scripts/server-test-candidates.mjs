/**
 * Test files not in vitest.server-tests.ts that pass with no DOM. Reported, not enforced: browser code can
 * pass without a DOM too. A generated config, since `--environment node` doesn't override a project's own.
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
  // A non-zero exit is expected: most of these need a DOM.
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
