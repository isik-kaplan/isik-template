#!/usr/bin/env node
// Fails the build unless every mutant in StrykerJS's own JSON report (reports/mutation/mutation.json,
// relative to the app directory passed as argv[2]) is either killed, or named in that app's
// mutation-exemptions.json with a reason - mirroring the backend's mutation-exemptions.toml/
// check_mutants.py pair. Never an inline `// Stryker disable` comment: this is the one place
// equivalent mutants get documented, so a survivor can't be silenced without a reviewable reason.
//
// Catalog entries are keyed by (file, mutatorName, fingerprint), where fingerprint is a hash of the
// exact source text the mutant's own location spans - not a line number, so a reformat or an edit
// elsewhere in the file can't leave a stale entry silently covering the wrong code. An entry whose
// fingerprint no longer matches anything simply stops applying - the mutant it used to excuse comes
// back as unexplained, the same way it would if the entry were deleted outright.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Timeout counts as alive, same as mutmut's backend equivalent (survived/suspicious/timeout/
// no_tests/segfault) - a mutant the suite never gave a real verdict on is a hole, not a pass.
const ALIVE = new Set(['Survived', 'NoCoverage', 'Timeout'])

function fingerprint(sourceLines, location) {
  const snippet = sourceLines.slice(location.start.line - 1, location.end.line).join('\n')
  return createHash('sha256').update(snippet).digest('hex').slice(0, 12)
}

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

  let totalMutants = 0
  let totalAlive = 0
  const unexplained = []
  const sourceCache = new Map()

  for (const [file, data] of Object.entries(report.files)) {
    const entries = catalog[file] ?? []
    const absFile = path.join(appRoot, file)
    for (const mutant of data.mutants) {
      totalMutants++
      if (!ALIVE.has(mutant.status)) continue
      totalAlive++

      if (!sourceCache.has(absFile)) {
        sourceCache.set(absFile, readFileSync(absFile, 'utf8').split('\n'))
      }
      const fp = fingerprint(sourceCache.get(absFile), mutant.location)
      const exempt = entries.some((entry) => entry.mutator === mutant.mutatorName && entry.fingerprint === fp)
      if (!exempt) {
        unexplained.push({ file, mutant, fp })
      }
    }
  }

  if (unexplained.length > 0) {
    console.log(`${unexplained.length} mutant(s) survived with no exemption on record:\n`)
    for (const { file, mutant, fp } of unexplained) {
      const { line, column } = mutant.location.start
      console.log(`  ${file}:${line}:${column}  ${mutant.mutatorName}  (fingerprint ${fp})`)
      console.log(`    status: ${mutant.status}, replacement: ${mutant.replacement}`)
    }
    console.log(
      '\nEither add a test that kills it, or record it in mutation-exemptions.json with a reason for why no test can.'
    )
    process.exitCode = 1
    return
  }

  console.log(`no unexplained survivors (${totalMutants} mutants total, ${totalAlive} alive and all exempt)`)
}

main()
