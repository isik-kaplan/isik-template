import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The web app's legal folder, mounted read-only (docker-compose.e2e.yml), so the specs check the documents and the
// cookie list this checkout really ships rather than a copy of them.
const LEGAL = '/legal'

export const DOCUMENTS: { slug: string; disclosesStorage?: boolean }[] = JSON.parse(
  readFileSync(join(LEGAL, 'documents.json'), 'utf8')
).documents

export const STORAGE_ITEMS: { name: string; kind: 'cookie' | 'localStorage' }[] = JSON.parse(
  readFileSync(join(LEGAL, 'storage.json'), 'utf8')
).items

/** The English text of a document, or null while it has not been written. */
export function englishText(slug: string): string | null {
  const file = join(LEGAL, 'en', `${slug}.md`)
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return text.trim() ? text : null
}

/** The first line of a document as it reads on the page, without its Markdown markers. */
export function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim()) ?? ''
  return line.replace(/^[#>*\s]+|[*\s]+$/g, '')
}
