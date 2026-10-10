import { type Language, languages } from '@/i18n/config'

import { LEGAL_DOCUMENTS, type LegalSlug } from './legalDocuments'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type LoadedLegalDocument = { content: string; language: Language }

// Every file a request can reach, built up front from the definition and the configured languages: a request only
// picks an entry, it never contributes to a path.
const FILES = Object.fromEntries(
  LEGAL_DOCUMENTS.map(({ slug }) => [
    slug,
    Object.fromEntries(languages.map((language) => [language, path.join('src', 'legal', language, `${slug}.md`)])),
  ])
) as Record<LegalSlug, Record<Language, string>>

async function readIfPresent(file: string): Promise<string | null> {
  try {
    const content = await readFile(path.join(process.cwd(), file), 'utf8')
    // An empty file is a placeholder somebody created, not a document anyone could agree to.
    return content.trim() ? content : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** The document in the visitor's language, else in English, else null: not written yet. */
export async function readLegalDocument(slug: LegalSlug, language: Language): Promise<LoadedLegalDocument | null> {
  for (const candidate of new Set<Language>([language, 'en'])) {
    const content = await readIfPresent(FILES[slug][candidate])
    if (content !== null) return { content, language: candidate }
  }
  return null
}
