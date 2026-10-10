#!/usr/bin/env node
/**
 * Warns, without failing, when a production build ships without its English legal documents. The pages still
 * render without them, saying the document has not been added yet, so nothing else would notice.
 *
 *     node scripts/check-legal-documents.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(import.meta.dirname, '..')

/** The English documents the definition names that are missing or empty, as paths from the app's root. */
export function missingLegalDocuments(app = APP) {
  const { documents } = JSON.parse(readFileSync(join(app, 'src/legal/documents.json'), 'utf8'))
  return documents
    .map(({ slug }) => `src/legal/en/${slug}.md`)
    .filter((file) => !existsSync(join(app, file)) || !readFileSync(join(app, file), 'utf8').trim())
}

export function warning(missing) {
  if (missing.length === 0) return null
  const files = missing.map((file) => `  apps/web/${file}`).join('\n')
  return (
    '\nwarning: building without these legal documents - their pages say so until they exist:\n' +
    `${files}\n` +
    'See SETUP.md at the repository root for how to add them.\n'
  )
}

// Only when run as a command: the test imports these, and a bare import must not print.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const message = warning(missingLegalDocuments())
  if (message) console.warn(message)
}
