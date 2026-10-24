#!/usr/bin/env node
// Fails unless every surviving mutant is exempted, with a reason, in the app's mutation-exemptions.json -
// never by inline directives. Entries are keyed by a hash of the mutant's source text, not a line number.
// Exempt mutants still run, so an entry no survivor matches any more fails as stale.
import { inlineDirectives, judgeMutants, weakReasons } from './judge-mutants.mjs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function main() {
  const appRoot = path.resolve(process.argv[2] ?? '.')
  const reportPath = path.join(appRoot, 'reports/mutation/mutation.json')
  const catalogPath = path.join(appRoot, 'mutation-exemptions.json')

  if (!existsSync(reportPath)) {
    console.error(`${reportPath} not found - did "stryker run" produce a JSON report?`)
    process.exitCode = 1
    return
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : {}
  const { total, alive, unexplained, stale, plural, broken, orphaned } = judgeMutants(report, catalog, {
    readLines: (file) => readFileSync(path.join(appRoot, file), 'utf8').split('\n'),
    exists: (file) => existsSync(path.join(appRoot, file)),
  })
  const weak = weakReasons(catalog)
  const directives = inlineDirectives(
    Object.fromEntries(Object.keys(report.files).map((file) => [file, readFileSync(path.join(appRoot, file), 'utf8')]))
  )

  if (broken.length > 0) {
    console.log(`${broken.length} mutant(s) neither ran nor died - the run measured less than it reports:\n`)
    for (const { file, mutant } of broken) {
      const { line, column } = mutant.location.start
      console.log(`  ${file}:${line}:${column}  ${mutant.mutatorName}  status: ${mutant.status}`)
    }
    console.log()
  }

  if (weak.length > 0) {
    console.log(`${weak.length} exemption(s) give no reason no test can kill them:\n`)
    for (const { file, entry } of weak) console.log(`  ${file}  ${entry.mutator}  (fingerprint ${entry.fingerprint})`)
    console.log('\nAn exemption claims no test CAN kill the mutant - not that none does yet. Say why, or write it.\n')
  }

  if (directives.length > 0) {
    console.log(`${directives.length} inline Stryker directive(s) - exemptions belong in mutation-exemptions.json:\n`)
    for (const { file, line } of directives) console.log(`  ${file}:${line}`)
    console.log()
  }

  if (plural.length > 0) {
    // Not a failure: a fingerprint spans whole lines, so two same-kind mutants on one line share an entry.
    console.log(
      `${plural.length} exemption(s) match more mutants than they have entries - check each reason covers them all:\n`
    )
    for (const { file, entry, count } of plural) {
      console.log(`  ${file}  ${entry.mutator}  (fingerprint ${entry.fingerprint})  ${count} mutants`)
    }
    console.log()
  }

  if (unexplained.length > 0) {
    console.log(`${unexplained.length} mutant(s) survived with no exemption on record:\n`)
    for (const { file, mutant, fingerprint } of unexplained) {
      const { line, column } = mutant.location.start
      console.log(`  ${file}:${line}:${column}  ${mutant.mutatorName}  (fingerprint ${fingerprint})`)
      console.log(`    status: ${mutant.status}, replacement: ${mutant.replacement}`)
    }
    console.log(
      '\nEither add a test that kills it, or record it in mutation-exemptions.json with a reason for why no test can.\n'
    )
  }

  if (stale.length > 0) {
    console.log(`${stale.length} exemption(s) excuse no surviving mutant any more:\n`)
    for (const { file, entry } of stale) {
      console.log(`  ${file}  ${entry.mutator}  (fingerprint ${entry.fingerprint})`)
    }
    console.log(
      '\nA test kills that mutant now, or the code it described has changed. Remove the entry from ' +
        'mutation-exemptions.json.\n'
    )
  }

  if (orphaned.length > 0) {
    console.log(`mutation-exemptions.json names ${orphaned.length} file(s) that no longer exist:\n`)
    for (const file of orphaned) console.log(`  ${file}`)
    console.log('\nRemove their entries, or move them under the file the code now lives in.\n')
  }

  const failures = [unexplained, stale, orphaned, broken, weak, directives]
  if (failures.some((found) => found.length > 0)) {
    process.exitCode = 1
    return
  }

  console.log(`no unexplained survivors or stale exemptions (${total} mutants total, ${alive} alive and all exempt)`)
}

main()
