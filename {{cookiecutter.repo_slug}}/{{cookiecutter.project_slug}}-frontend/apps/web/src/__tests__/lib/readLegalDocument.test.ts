import { readLegalDocument } from '@/lib/readLegalDocument'

import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string>()
const readFile = vi.fn(async (file: string) => {
  if (files.has(file)) return files.get(file)
  throw Object.assign(new Error(`ENOENT: ${file}`), { code: 'ENOENT' })
})
vi.mock('node:fs/promises', () => {
  const fs = { readFile: (...args: [string]) => readFile(...args) }
  return { ...fs, default: fs }
})

const at = (language: string, slug: string) => path.join(process.cwd(), 'src', 'legal', language, `${slug}.md`)

describe('readLegalDocument', () => {
  beforeEach(() => {
    files.clear()
    readFile.mockClear()
  })

  it("reads the visitor's language from the app's own legal folder", async () => {
    files.set(at('en', 'terms-of-service'), '# Terms')

    expect(await readLegalDocument('terms-of-service', 'en')).toEqual({ content: '# Terms', language: 'en' })
    expect(readFile).toHaveBeenCalledWith(at('en', 'terms-of-service'), 'utf8')
  })

  it('answers null when the document has not been written in any language', async () => {
    expect(await readLegalDocument('privacy-policy', 'en')).toBeNull()
  })

  it('treats an empty or blank file as not written yet', async () => {
    files.set(at('en', 'privacy-policy'), '  \n\t\n')

    expect(await readLegalDocument('privacy-policy', 'en')).toBeNull()
  })

  it('keeps the text exactly as written, surrounding whitespace included', async () => {
    files.set(at('en', 'privacy-policy'), '\n# Privacy\n')

    expect(await readLegalDocument('privacy-policy', 'en')).toEqual({ content: '\n# Privacy\n', language: 'en' })
  })

  it('reads a document only once when the visitor already reads English', async () => {
    await readLegalDocument('privacy-policy', 'en')

    expect(readFile).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failure other than a missing file rather than calling the document unwritten', async () => {
    readFile.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))

    await expect(readLegalDocument('terms-of-service', 'en')).rejects.toThrow('EACCES')
  })
{%- if cookiecutter.languages.split(',') | length > 1 %}
{%- set other = cookiecutter.languages.split(',')[1].strip() %}

  it('prefers a translation when one exists', async () => {
    files.set(at('en', 'terms-of-service'), '# Terms')
    files.set(at('{{ other }}', 'terms-of-service'), '# Translated')

    expect(await readLegalDocument('terms-of-service', '{{ other }}')).toEqual({
      content: '# Translated',
      language: '{{ other }}',
    })
  })

  it('falls back to English, saying so, when the translation is missing', async () => {
    files.set(at('en', 'terms-of-service'), '# Terms')

    expect(await readLegalDocument('terms-of-service', '{{ other }}')).toEqual({ content: '# Terms', language: 'en' })
    expect(readFile.mock.calls.map(([file]) => file)).toEqual([
      at('{{ other }}', 'terms-of-service'),
      at('en', 'terms-of-service'),
    ])
  })
{%- endif %}
})
