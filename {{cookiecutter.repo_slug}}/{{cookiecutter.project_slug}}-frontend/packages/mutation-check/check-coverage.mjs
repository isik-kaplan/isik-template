#!/usr/bin/env node
// Fails the build unless every uncovered statement/branch in the istanbul-format
// coverage/coverage-final.json (vitest's v8 provider and jest's babel/istanbul provider both
// produce this same shape) is named in coverage-exemptions.json with a reason - mirroring
// mutation-exemptions.json/check-mutants.mjs. Never an inline `/* istanbul ignore next */` or
// `/* v8 ignore next */`: this is the one place a gap gets documented, so it can't be silenced
// without a reviewable reason, and the two coverage providers stop needing two different
// comment dialects to say the same thing.
//
// Entries are keyed by (file, kind, fingerprint[, branchIndex]) - fingerprint is a hash of the
// exact source text the gap's own location spans, so a reformat or an edit elsewhere in the file
// can't leave a stale entry silently covering the wrong code.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function fingerprint(sourceLines, loc) {
  const snippet = sourceLines.slice(loc.start.line - 1, loc.end.line).join('\n')
  return createHash('sha256').update(snippet).digest('hex').slice(0, 12)
}

function main() {
  const appRoot = path.resolve(process.argv[2] ?? '.')
  const reportPath = path.join(appRoot, process.argv[3] ?? 'coverage/coverage-final.json')
  const catalogPath = path.join(appRoot, 'coverage-exemptions.json')

  if (!existsSync(reportPath)) {
    console.error(`${reportPath} not found - did the coverage run produce an istanbul-format report?`)
    process.exitCode = 1
    return
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : {}
  const sourceCache = new Map()
  const unexplained = []

  for (const [absFile, data] of Object.entries(report)) {
    const file = path.relative(appRoot, absFile)
    const entries = catalog[file] ?? []
    if (!sourceCache.has(absFile)) sourceCache.set(absFile, readFileSync(absFile, 'utf8').split('\n'))
    const lines = sourceCache.get(absFile)

    for (const [id, loc] of Object.entries(data.statementMap)) {
      if (data.s[id] !== 0) continue
      const fp = fingerprint(lines, loc)
      const exempt = entries.some((e) => e.kind === 'statement' && e.fingerprint === fp)
      if (!exempt) unexplained.push({ file, kind: 'statement', loc, fp })
    }

    for (const [id, branch] of Object.entries(data.branchMap)) {
      const counts = data.b[id]
      const fp = fingerprint(lines, branch.loc)
      counts.forEach((count, index) => {
        if (count !== 0) return
        const exempt = entries.some((e) => e.kind === 'branch' && e.fingerprint === fp && e.branchIndex === index)
        if (!exempt) unexplained.push({ file, kind: 'branch', loc: branch.loc, fp, branchIndex: index })
      })
    }
  }

  if (unexplained.length > 0) {
    console.log(`${unexplained.length} uncovered spot(s) with no exemption on record:\n`)
    for (const u of unexplained) {
      const extra = u.kind === 'branch' ? ` branchIndex=${u.branchIndex}` : ''
      console.log(`  ${u.file}:${u.loc.start.line}:${u.loc.start.column}  ${u.kind}${extra}  (fingerprint ${u.fp})`)
    }
    console.log(
      '\nEither add a test that covers it, or record it in coverage-exemptions.json with a reason for why no test can.'
    )
    process.exitCode = 1
    return
  }

  console.log('no unexplained coverage gaps')
}

main()
