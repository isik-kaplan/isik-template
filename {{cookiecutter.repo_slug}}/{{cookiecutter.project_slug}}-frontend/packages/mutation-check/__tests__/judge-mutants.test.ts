import { fingerprint, judgeMutants } from '../judge-mutants.mjs'
import { describe, expect, it } from 'vitest'

const SOURCE = ['const a = 1 + 2', 'const b = a > 0', "const c = 'x' + 'y'"]

type Status = 'Killed' | 'Survived' | 'NoCoverage' | 'Timeout' | 'CompileError'

function mutant(line: number, status: Status, mutatorName = 'ArithmeticOperator') {
  return { mutatorName, status, replacement: '?', location: { start: { line, column: 1 }, end: { line, column: 9 } } }
}

function entry(line: number, mutator = 'ArithmeticOperator') {
  return { mutator, fingerprint: fingerprint(SOURCE, mutant(line, 'Survived').location), reason: ['equivalent'] }
}

function judge(
  files: Record<string, ReturnType<typeof mutant>[]>,
  catalog: Record<string, ReturnType<typeof entry>[]>,
  onDisk = Object.keys(files)
) {
  const report = { files: Object.fromEntries(Object.entries(files).map(([file, mutants]) => [file, { mutants }])) }
  return judgeMutants(report, catalog, { readLines: () => SOURCE, exists: (file: string) => onDisk.includes(file) })
}

describe('fingerprint', () => {
  it('hashes the whole lines a location spans, and nothing else', () => {
    const one = fingerprint(SOURCE, mutant(1, 'Survived').location)

    expect(one).toMatch(/^[0-9a-f]{12}$/)
    expect(fingerprint(['other', ...SOURCE], { start: { line: 2, column: 5 }, end: { line: 2, column: 6 } })).toBe(one)
    expect(fingerprint(SOURCE, { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } })).not.toBe(one)
  })
})

describe('judgeMutants', () => {
  it('passes a killed mutant and an exempt survivor, and counts both', () => {
    const verdict = judge({ 'src/a.ts': [mutant(1, 'Killed'), mutant(2, 'Survived')] }, { 'src/a.ts': [entry(2)] })

    expect(verdict).toEqual({ total: 2, alive: 1, unexplained: [], stale: [], plural: [], orphaned: [] })
  })

  it.each(['Survived', 'NoCoverage', 'Timeout'] as const)(
    'holds a %s mutant with no entry against the run',
    (status) => {
      const alive = mutant(1, status)

      expect(judge({ 'src/a.ts': [alive] }, {}).unexplained).toEqual([
        { file: 'src/a.ts', mutant: alive, fingerprint: entry(1).fingerprint },
      ])
    }
  )

  it('does not count a mutant that never compiled as alive', () => {
    expect(judge({ 'src/a.ts': [mutant(1, 'CompileError')] }, {})).toMatchObject({ alive: 0, unexplained: [] })
  })

  // Same lines, different mutator: an entry excuses only the kind of change its reason was written for.
  it('excuses only the mutator an entry names', () => {
    const verdict = judge({ 'src/a.ts': [mutant(1, 'Survived', 'StringLiteral')] }, { 'src/a.ts': [entry(1)] })

    expect(verdict.unexplained).toHaveLength(1)
    expect(verdict.stale).toEqual([{ file: 'src/a.ts', entry: entry(1) }])
  })

  // The recheck: Stryker runs exempt mutants like any other, so an entry nothing survives under has
  // been disproved by this very run.
  it('reports an entry whose mutant a test now kills as stale', () => {
    const verdict = judge({ 'src/a.ts': [mutant(1, 'Killed')] }, { 'src/a.ts': [entry(1)] })

    expect(verdict.stale).toEqual([{ file: 'src/a.ts', entry: entry(1) }])
    expect(verdict.unexplained).toEqual([])
  })

  it('reports an entry whose code changed under it as stale', () => {
    const verdict = judge({ 'src/a.ts': [mutant(3, 'Survived')] }, { 'src/a.ts': [entry(1), entry(3)] })

    expect(verdict.stale).toEqual([{ file: 'src/a.ts', entry: entry(1) }])
  })

  // A sharded run reports its own files alone; another shard's entries are that shard's to judge.
  it('leaves the entries of a file this run did not measure alone', () => {
    const verdict = judge({ 'src/a.ts': [mutant(1, 'Survived')] }, { 'src/a.ts': [entry(1)], 'src/b.ts': [entry(2)] }, [
      'src/a.ts',
      'src/b.ts',
    ])

    expect(verdict).toMatchObject({ unexplained: [], stale: [], orphaned: [] })
  })

  it('reports catalog files that are gone from disk whichever shard ran', () => {
    expect(judge({ 'src/a.ts': [mutant(1, 'Killed')] }, { 'src/gone.ts': [entry(1)] }).orphaned).toEqual([
      'src/gone.ts',
    ])
  })

  // A fingerprint spans whole lines, so one line can hand an entry several mutants of its kind.
  it('counts the mutants an entry excuses when there is more than one', () => {
    const verdict = judge({ 'src/a.ts': [mutant(3, 'Survived'), mutant(3, 'Timeout')] }, { 'src/a.ts': [entry(3)] })

    expect(verdict.plural).toEqual([{ file: 'src/a.ts', entry: entry(3), count: 2 }])
    expect(verdict).toMatchObject({ unexplained: [], stale: [] })
  })

  // One entry per mutant: identical entries share a key, and each needs a mutant of its own.
  it('counts identical entries against the mutants their key matches', () => {
    const both = judge(
      { 'src/a.ts': [mutant(3, 'Survived'), mutant(3, 'Survived')] },
      { 'src/a.ts': [entry(3), entry(3)] }
    )
    const one = judge(
      { 'src/a.ts': [mutant(3, 'Survived'), mutant(3, 'Killed')] },
      { 'src/a.ts': [entry(3), entry(3)] }
    )

    expect(both).toMatchObject({ unexplained: [], stale: [], plural: [] })
    expect(one).toMatchObject({ unexplained: [], stale: [{ file: 'src/a.ts', entry: entry(3) }], plural: [] })
  })

  it('reads a file only when it has a mutant left alive', () => {
    const read: string[] = []
    const report = {
      files: { 'src/a.ts': { mutants: [mutant(1, 'Killed')] }, 'src/b.ts': { mutants: [mutant(1, 'Survived')] } },
    }

    judgeMutants(report, {}, { readLines: (file: string) => (read.push(file), SOURCE), exists: () => true })

    expect(read).toEqual(['src/b.ts'])
  })
})
