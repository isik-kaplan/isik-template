import { missingLegalDocuments, warning } from '../../../scripts/check-legal-documents.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, '../../../scripts/check-legal-documents.mjs')

function app(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'legal-'))
  mkdirSync(join(root, 'src/legal/en'), { recursive: true })
  const documents = [{ slug: 'terms-of-service' }, { slug: 'privacy-policy' }]
  writeFileSync(join(root, 'src/legal/documents.json'), JSON.stringify({ documents }))
  for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content)
  return root
}

describe('missingLegalDocuments', () => {
  it('names every English document the definition lists that does not exist, in order', () => {
    expect(missingLegalDocuments(app({}))).toEqual([
      'src/legal/en/terms-of-service.md',
      'src/legal/en/privacy-policy.md',
    ])
  })

  it('counts a blank file as missing, and a written one as present', () => {
    const root = app({ 'src/legal/en/terms-of-service.md': ' \n', 'src/legal/en/privacy-policy.md': '# Privacy' })

    expect(missingLegalDocuments(root)).toEqual(['src/legal/en/terms-of-service.md'])
  })
})

describe('warning', () => {
  it('is nothing when every document exists', () => {
    expect(warning([])).toBeNull()
  })

  it('names each missing file from the workspace and points at the setup guide', () => {
    expect(warning(['src/legal/en/terms-of-service.md'])).toBe(
      '\nwarning: building without these legal documents - their pages say so until they exist:\n' +
        '  apps/web/src/legal/en/terms-of-service.md\n' +
        'See SETUP.md at the repository root for how to add them.\n'
    )
  })
})

describe('as a command', () => {
  it("warns about this app's own missing documents without failing the build", () => {
    const run = spawnSync('node', [SCRIPT], { encoding: 'utf8' })

    expect(run.status).toBe(0)
    expect(run.stderr).toBe(`${warning(missingLegalDocuments()) ?? ''}${missingLegalDocuments().length ? '\n' : ''}`)
  })
})
