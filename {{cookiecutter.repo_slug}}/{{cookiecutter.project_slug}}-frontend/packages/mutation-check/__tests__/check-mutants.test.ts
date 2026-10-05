import { fingerprint } from '../judge-mutants.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Run as a process rather than imported: it is a CI gate, and its contract is the exit code and
// what it prints.
const SCRIPT = join(import.meta.dirname, '../check-mutants.mjs')
const SOURCE = ['export const a = 1 + 2', 'export const b = 3 - 4']

let app: string

function mutant(line: number, status: string) {
  return {
    mutatorName: 'ArithmeticOperator',
    status,
    replacement: '?',
    location: { start: { line, column: 18 }, end: { line, column: 23 } },
  }
}

function entry(line: number) {
  return { mutator: 'ArithmeticOperator', fingerprint: fingerprint(SOURCE, mutant(line, '').location), reason: ['x'] }
}

function arrange(mutants: ReturnType<typeof mutant>[] | null, catalog?: object) {
  if (mutants) {
    mkdirSync(join(app, 'reports/mutation'), { recursive: true })
    writeFileSync(join(app, 'reports/mutation/mutation.json'), JSON.stringify({ files: { 'src/a.ts': { mutants } } }))
  }
  if (catalog) writeFileSync(join(app, 'mutation-exemptions.json'), JSON.stringify(catalog))
}

function check() {
  try {
    return { out: execFileSync('node', [SCRIPT, app], { encoding: 'utf8', stdio: 'pipe' }), code: 0 }
  } catch (error) {
    const failure = error as { stdout: string; stderr: string; status: number }
    return { out: failure.stdout + failure.stderr, code: failure.status }
  }
}

describe('check-mutants', () => {
  beforeEach(() => {
    app = mkdtempSync(join(tmpdir(), 'check-mutants-'))
    mkdirSync(join(app, 'src'))
    writeFileSync(join(app, 'src/a.ts'), SOURCE.join('\n'))
  })

  afterEach(() => {
    rmSync(app, { recursive: true, force: true })
  })

  it('fails when Stryker left no report to check', () => {
    const { out, code } = check()

    expect(code).toBe(1)
    expect(out).toContain('did "stryker run" produce a JSON report?')
  })

  it('passes every mutant killed or exempt, with no catalog file at all', () => {
    arrange([mutant(1, 'Killed')])

    expect(check()).toEqual({
      out: 'no unexplained survivors or stale exemptions (1 mutants total, 0 alive and all exempt)\n',
      code: 0,
    })
  })

  it('passes a survivor the catalog excuses', () => {
    arrange([mutant(1, 'Killed'), mutant(2, 'Survived')], { 'src/a.ts': [entry(2)] })

    expect(check()).toMatchObject({ code: 0, out: expect.stringContaining('2 mutants total, 1 alive') })
  })

  it('fails a survivor nothing excuses, naming where it is', () => {
    arrange([mutant(2, 'Survived')])

    const { out, code } = check()

    expect(code).toBe(1)
    expect(out).toContain('1 mutant(s) survived with no exemption on record')
    expect(out).toContain(`src/a.ts:2:18  ArithmeticOperator  (fingerprint ${entry(2).fingerprint})`)
  })

  it('fails an exemption whose mutant now dies, saying to remove it', () => {
    arrange([mutant(1, 'Killed'), mutant(2, 'Survived')], { 'src/a.ts': [entry(1), entry(2)] })

    const { out, code } = check()

    expect(code).toBe(1)
    expect(out).toContain('1 exemption(s) excuse no surviving mutant any more')
    expect(out).toContain(`src/a.ts  ArithmeticOperator  (fingerprint ${entry(1).fingerprint})`)
    expect(out).toContain('Remove the entry from mutation-exemptions.json')
    expect(out).not.toContain('survived with no exemption')
  })

  it('fails a catalog that names a file no longer on disk', () => {
    arrange([mutant(1, 'Killed')], { 'src/gone.ts': [entry(1)] })

    const { out, code } = check()

    expect(code).toBe(1)
    expect(out).toContain('names 1 file(s) that no longer exist')
    expect(out).toContain('  src/gone.ts\n')
  })

  it('passes an exemption excusing two mutants of one line, but says so', () => {
    arrange([mutant(1, 'Survived'), mutant(1, 'Survived')], { 'src/a.ts': [entry(1)] })

    const { out, code } = check()

    expect(code).toBe(0)
    expect(out).toContain('1 exemption(s) match more mutants than they have entries')
    expect(out).toContain(`src/a.ts  ArithmeticOperator  (fingerprint ${entry(1).fingerprint})  2 mutants`)
  })
})
