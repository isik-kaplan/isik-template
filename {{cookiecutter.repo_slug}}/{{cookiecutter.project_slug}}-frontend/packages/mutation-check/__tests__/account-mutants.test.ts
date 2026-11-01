import { accountFor, lines, summarize } from '../account-mutants.mjs'
import { fingerprint } from '../judge-mutants.mjs'
import { describe, expect, it } from 'vitest'

const SOURCE = ['const a = 1 + 2', 'const b = a > 0', "const c = 'x' + 'y'"]

function mutant(id: string, line: number, status: string, mutatorName = 'ArithmeticOperator') {
  return {
    id,
    mutatorName,
    status,
    replacement: '?',
    location: { start: { line, column: 1 }, end: { line, column: 9 } },
  }
}

function entry(line: number, mutator = 'ArithmeticOperator') {
  return { mutator, fingerprint: fingerprint(SOURCE, mutant('', line, '').location), reason: ['equivalent'] }
}

function report(mutants: ReturnType<typeof mutant>[]) {
  return { files: { 'src/a.ts': { language: 'typescript', source: SOURCE.join('\n'), mutants } } }
}

const statuses = (accounted: ReturnType<typeof accountFor>) =>
  accounted.files['src/a.ts'].mutants.map((each: { status: string }) => each.status)

describe('accountFor', () => {
  it.each(['Survived', 'NoCoverage', 'Timeout'])('restates an exempt %s mutant as Ignored, with why', (status) => {
    const accounted = accountFor(report([mutant('1', 1, status)]), { 'src/a.ts': [entry(1)] })

    expect(accounted.ignored).toBe(1)
    expect(accounted.files['src/a.ts'].mutants[0]).toMatchObject({
      status: 'Ignored',
      statusReason: 'Exempt in mutation-exemptions.json',
    })
  })

  it('leaves a killed mutant killed, even one an entry would excuse', () => {
    const accounted = accountFor(report([mutant('1', 1, 'Killed')]), { 'src/a.ts': [entry(1)] })

    expect(statuses(accounted)).toEqual(['Killed'])
    expect(accounted.ignored).toBe(0)
  })

  it('excuses only the mutator and the lines an entry names', () => {
    const accounted = accountFor(
      report([mutant('1', 1, 'Survived', 'StringLiteral'), mutant('2', 2, 'Survived'), mutant('3', 1, 'Survived')]),
      { 'src/a.ts': [entry(1)] }
    )

    expect(statuses(accounted)).toEqual(['Survived', 'Survived', 'Ignored'])
  })

  it('excuses nothing in a file the catalog does not name', () => {
    const accounted = accountFor(report([mutant('1', 1, 'Survived')]), { 'src/b.ts': [entry(1)] })

    expect(statuses(accounted)).toEqual(['Survived'])
    expect(accounted.files['src/a.ts'].source).toBe(SOURCE.join('\n'))
  })
})

describe('summarize', () => {
  it('scores what is left once the exempt are out of the count', () => {
    const run = report([
      mutant('1', 1, 'Killed'),
      mutant('2', 2, 'Survived'),
      mutant('3', 3, 'Survived', 'StringLiteral'),
    ])

    expect(summarize(run, { 'src/a.ts': [entry(2)] })).toEqual({
      score: 50,
      detected: 1,
      valid: 2,
      ignored: 1,
      total: 3,
      share: (1 / 3) * 100,
    })
  })

  it('reads a full score when every survivor is exempt', () => {
    const run = report([mutant('1', 1, 'Killed'), mutant('2', 2, 'Survived')])

    expect(summarize(run, { 'src/a.ts': [entry(2)] })).toMatchObject({ score: 100, valid: 1, share: 50 })
  })

  it('has no share to report when nothing was mutated', () => {
    expect(summarize({ files: {} }, {})).toMatchObject({ total: 0, ignored: 0, share: 0 })
  })
})

describe('lines', () => {
  it('prints the score, what it was out of, and the exempt share, to two places', () => {
    expect(lines({ score: 98.765, detected: 80, valid: 81, ignored: 4, total: 85, share: 4.7058 })).toEqual([
      'Mutation score, exemptions excluded: 98.77',
      '  80 of 81 mutants a test is expected to kill',
      '  4 exempt (4.71% of 85)',
    ])
  })
})
