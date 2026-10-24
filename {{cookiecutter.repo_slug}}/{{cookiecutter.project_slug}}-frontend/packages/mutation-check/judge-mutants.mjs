import { createHash } from 'node:crypto'

// Timeout counts as alive: a mutant the suite never gave a real verdict on is a hole, not a pass.
export const ALIVE = new Set(['Survived', 'NoCoverage', 'Timeout'])
export const BROKEN = new Set(['CompileError', 'RuntimeError'])

export const SHORTEST_USEFUL_REASON = 40
const EXCUSES = /\b(hard to test|difficult|not worth|too fiddly|covered elsewhere|todo)\b/i

export function fingerprint(sourceLines, location) {
  const snippet = sourceLines.slice(location.start.line - 1, location.end.line).join('\n')
  return createHash('sha256').update(snippet).digest('hex').slice(0, 12)
}

/**
 * One catalog entry per mutant: identical entries are counted against the mutants their key matches.
 * Only files in the report are judged, since a sharded run reports only its own files.
 */
export function judgeMutants(report, catalog, { readLines, exists }) {
  let total = 0
  let alive = 0
  const unexplained = []
  const stale = []
  const plural = []
  const broken = []

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
      if (BROKEN.has(mutant.status)) broken.push({ file, mutant })
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

  return { total, alive, unexplained, stale, plural, broken, orphaned }
}

/** An exemption claims no test CAN kill the mutant, so "no test yet" excuses are weak. */
export function weakReasons(catalog) {
  return Object.entries(catalog).flatMap(([file, entries]) =>
    entries
      .filter(({ reason }) => {
        const said = [reason ?? []].flat().join(' ').trim()
        return said.length < SHORTEST_USEFUL_REASON || EXCUSES.test(said)
      })
      .map((entry) => ({ file, entry }))
  )
}

export function inlineDirectives(sources) {
  return Object.entries(sources).flatMap(([file, text]) =>
    text
      .split('\n')
      .flatMap((line, index) => (/Stryker (disable|restore)/.test(line) ? [{ file, line: index + 1 }] : []))
  )
}
