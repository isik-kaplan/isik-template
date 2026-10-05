// The verdicts check-mutants.mjs prints, kept apart from its file reading so they can be tested
// against hand-built reports.
import { createHash } from 'node:crypto'

// Timeout counts as alive, same as mutmut's backend equivalent (survived/suspicious/timeout/
// no_tests/segfault) - a mutant the suite never gave a real verdict on is a hole, not a pass.
export const ALIVE = new Set(['Survived', 'NoCoverage', 'Timeout'])

export function fingerprint(sourceLines, location) {
  const snippet = sourceLines.slice(location.start.line - 1, location.end.line).join('\n')
  return createHash('sha256').update(snippet).digest('hex').slice(0, 12)
}

/**
 * Sets a Stryker JSON report against an exemption catalog.
 *
 * `readLines(file)` returns a reported file's source lines; `exists(file)` says whether a catalog
 * file is still on disk. The catalog holds one entry per mutant, so identical entries are counted
 * against the alive mutants their (mutator, fingerprint) matches. Returns every alive mutant no
 * entry excuses (`unexplained`), every entry beyond the mutants left for it (`stale`), every key
 * matching more mutants than it has entries (`plural`), and every catalog file that is gone
 * (`orphaned`).
 *
 * Only files in the report are judged. A sharded run reports its own files alone, and an entry for
 * another shard's file says nothing about this run.
 */
export function judgeMutants(report, catalog, { readLines, exists }) {
  let total = 0
  let alive = 0
  const unexplained = []
  const stale = []
  const plural = []

  for (const [file, data] of Object.entries(report.files)) {
    const keys = new Map()
    for (const entry of catalog[file] ?? []) {
      const key = `${entry.mutator}:${entry.fingerprint}`
      if (!keys.has(key)) keys.set(key, { entries: [], excused: 0 })
      keys.get(key).entries.push(entry)
    }
    let lines

    for (const mutant of data.mutants) {
      total++
      if (!ALIVE.has(mutant.status)) continue
      alive++
      lines ??= readLines(file)

      const fp = fingerprint(lines, mutant.location)
      const key = keys.get(`${mutant.mutatorName}:${fp}`)
      if (key) key.excused++
      else unexplained.push({ file, mutant, fingerprint: fp })
    }

    for (const { entries, excused } of keys.values()) {
      for (const entry of entries.slice(excused)) stale.push({ file, entry })
      if (excused > entries.length) plural.push({ file, entry: entries[0], count: excused })
    }
  }

  const orphaned = Object.keys(catalog).filter((file) => !exists(file))

  return { total, alive, unexplained, stale, plural, orphaned }
}
