import { languages } from '@/i18n/config'
import { LEGAL_DOCUMENTS } from '@/lib/legalDocuments'
import { readLegalDocument } from '@/lib/readLegalDocument'
import { visitorFetch } from '@/lib/visitor'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import path from 'node:path'
import { describe, expect, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, string | Error>())
vi.mock('node:fs/promises', () => ({
  readFile: async (file: string) => {
    const held = files.get(file)
    if (held instanceof Error) throw held
    if (held === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return held
  },
}))

const key = vi.hoisted(() => ({ value: '' }))
vi.mock('@/config/server', () => ({ serverConfig: () => ({ FRONTEND_KEY: key.value }) }))

const at = (language: string, slug: string) => path.join(process.cwd(), 'src', 'legal', language, `${slug}.md`)

describe('a legal document', () => {
  const slug = fc.constantFrom(...LEGAL_DOCUMENTS.map((document) => document.slug))
  const language = fc.constantFrom(...languages)
  const written = fc.stringMatching(/^\S[\s\S]{0,40}$/)

  // Absent drawn as often as present: fc.option leaves a file out one time in six, and both out seldom.
  test.prop([slug, language, fc.oneof(fc.constant(null), written), fc.oneof(fc.constant(null), written)])(
    "is read in the visitor's language, else in English, else is not written yet",
    async (document, wanted, inTheirs, inEnglish) => {
      files.clear()
      // English first: for an English visitor the two are one file, and theirs is what it holds.
      if (inEnglish !== null) files.set(at('en', document), inEnglish)
      if (inTheirs !== null) files.set(at(wanted, document), inTheirs)

      const read = await readLegalDocument(document, wanted)

      const english = inEnglish === null ? null : { content: inEnglish, language: 'en' }
      expect(read).toEqual(inTheirs !== null ? { content: inTheirs, language: wanted } : english)
    }
  )

  test.prop([slug, fc.stringMatching(/^\s*$/)])(
    'that is only whitespace is a placeholder, not a document',
    async (document, blank) => {
      files.clear()
      files.set(at('en', document), blank)
      expect(await readLegalDocument(document, 'en')).toBeNull()
    }
  )

  test.prop([slug])('that cannot be read for another reason fails rather than reading as absent', async (document) => {
    files.clear()
    files.set(at('en', document), Object.assign(new Error('denied'), { code: 'EACCES' }))
    await expect(readLegalDocument(document, 'en')).rejects.toThrow('denied')
  })
})

describe("a server read on a visitor's behalf", () => {
  test.prop([fc.option(fc.stringMatching(/^[a-z0-9]{8,32}$/), { nil: '' }), fc.option(fc.ipV4(), { nil: null })])(
    'carries the frontend key and the visitor only when both are known',
    async (frontendKey, visitor) => {
      key.value = frontendKey
      const sent = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null))
      const read = visitorFetch(new Headers(visitor ? { 'x-client-ip': visitor } : {}), sent)

      await read('http://api.test-project.test/', { headers: { Accept: 'application/json' } })

      const headers = new Headers(sent.mock.calls[0][1]?.headers)
      const both = Boolean(frontendKey && visitor)
      expect(headers.get('X-Frontend-Key')).toBe(both ? frontendKey : null)
      expect(headers.get('X-Visitor-Ip')).toBe(both ? visitor : null)
      expect(headers.get('Accept')).toBe('application/json')
    }
  )
})
