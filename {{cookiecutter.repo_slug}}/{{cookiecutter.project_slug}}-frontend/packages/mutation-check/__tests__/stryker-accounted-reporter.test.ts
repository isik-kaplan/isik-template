import { fingerprint } from '../judge-mutants.mjs'
import { readCatalog, strykerPlugins } from '../stryker-accounted-reporter.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SOURCE = 'const a = 1 + 2'
const LOCATION = { start: { line: 1, column: 11 }, end: { line: 1, column: 16 } }
const CATALOG = { 'src/a.ts': [{ mutator: 'ArithmeticOperator', fingerprint: fingerprint([SOURCE], LOCATION) }] }

let app: string

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), 'accounted-'))
})

afterEach(() => {
  rmSync(app, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('readCatalog', () => {
  it("reads the app's own mutation-exemptions.json", () => {
    writeFileSync(join(app, 'mutation-exemptions.json'), JSON.stringify(CATALOG))

    expect(readCatalog(app)).toEqual(CATALOG)
  })

  it('is empty for an app with no exemptions on record', () => {
    expect(readCatalog(app)).toEqual({})
  })

  it('reads from where Stryker runs when given nowhere', () => {
    writeFileSync(join(app, 'mutation-exemptions.json'), JSON.stringify(CATALOG))
    vi.spyOn(process, 'cwd').mockReturnValue(app)

    expect(readCatalog()).toEqual(CATALOG)
  })
})

describe('the accounted reporter', () => {
  it('registers as a reporter named accounted, for stryker.config.json to name', () => {
    const [plugin] = strykerPlugins

    expect(plugin).toMatchObject({ kind: 'Reporter', name: 'accounted' })
  })

  it('prints the score with the exempt survivors taken out', () => {
    writeFileSync(join(app, 'mutation-exemptions.json'), JSON.stringify(CATALOG))
    vi.spyOn(process, 'cwd').mockReturnValue(app)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mutant = { mutatorName: 'ArithmeticOperator', replacement: '1 - 2', location: LOCATION }
    const report = {
      files: {
        'src/a.ts': {
          language: 'typescript',
          source: SOURCE,
          mutants: [
            { ...mutant, id: '1', status: 'Survived' },
            { ...mutant, id: '2', status: 'Killed', mutatorName: 'StringLiteral' },
          ],
        },
      },
    }

    strykerPlugins[0].value.onMutationTestReportReady(report)

    expect(log.mock.calls.map(([line]) => line)).toEqual([
      'Mutation score, exemptions excluded: 100.00',
      '  1 of 1 mutants a test is expected to kill',
      '  1 exempt (50.00% of 2)',
    ])
  })
})
