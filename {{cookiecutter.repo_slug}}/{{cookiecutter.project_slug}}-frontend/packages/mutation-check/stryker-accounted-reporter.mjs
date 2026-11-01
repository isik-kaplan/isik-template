// Stryker's own score counts an exempt survivor against the run, so it reads below 100 however
// complete the suite is. This prints the score the gate (check-mutants.mjs) actually holds a run to.
import { lines, summarize } from './account-mutants.mjs'
import { PluginKind, declareValuePlugin } from '@stryker-mutator/api/plugin'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function readCatalog(appRoot = process.cwd()) {
  const catalogPath = path.join(appRoot, 'mutation-exemptions.json')
  return existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : {}
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Reporter, 'accounted', {
    onMutationTestReportReady(report) {
      for (const line of lines(summarize(report, readCatalog()))) console.log(line)
    },
  }),
]
