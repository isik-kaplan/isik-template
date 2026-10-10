import LegalDocumentPage, { generateMetadata } from '@/app/legal/[doc]/page'
import { LEGAL_DOCUMENTS } from '@/lib/legalDocuments'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLanguage = vi.fn()
vi.mock('@/lib/getSession', () => ({ getLanguage: () => getLanguage() }))
const readLegalDocument = vi.fn()
vi.mock('@/lib/readLegalDocument', () => ({
  readLegalDocument: (...args: unknown[]) => readLegalDocument(...args),
}))
// notFound() interrupts rendering in real Next.js; thrown here too, so nothing after it can run.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

const TITLES = { 'terms-of-service': 'Terms of Service', 'privacy-policy': 'Privacy Policy' } as const

const pageFor = async (doc: string) => render(await LegalDocumentPage({ params: Promise.resolve({ doc }) }))

describe('LegalDocumentPage', () => {
  beforeEach(() => {
    getLanguage.mockResolvedValue('en')
    readLegalDocument.mockReset()
  })

  it.each(LEGAL_DOCUMENTS.map(({ slug }) => slug))('renders %s from its Markdown, under its title', async (slug) => {
    readLegalDocument.mockResolvedValue({ content: `# Heading of ${slug}\n\nBody *text*.`, language: 'en' })

    await pageFor(slug)

    expect(readLegalDocument).toHaveBeenCalledWith(slug, 'en')
    expect(screen.getByRole('heading', { level: 1, name: TITLES[slug] })).toBeTruthy()
    expect(screen.getByRole('heading', { name: `Heading of ${slug}` })).toBeTruthy()
    expect(screen.getByText('text').tagName).toBe('EM')
    expect(screen.getByRole('article').getAttribute('lang')).toBe('en')
    expect(screen.queryByText("This document hasn't been added yet")).toBeNull()
    expect(screen.queryByText(/isn't available in your language/)).toBeNull()
  })

  it('says a document has not been added yet, rather than failing, when its file does not exist', async () => {
    readLegalDocument.mockResolvedValue(null)

    await pageFor('terms-of-service')

    expect(screen.getByText("This document hasn't been added yet")).toBeTruthy()
    expect(screen.getByText('Its text will appear here once it has been published.')).toBeTruthy()
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy()
  })

  it("says so, and marks the text's own language, when it falls back to English", async () => {
    getLanguage.mockResolvedValue('xx')
    readLegalDocument.mockResolvedValue({ content: 'English text', language: 'en' })

    await pageFor('privacy-policy')

    expect(readLegalDocument).toHaveBeenCalledWith('privacy-policy', 'xx')
    expect(screen.getByText(/isn't available in your language yet/)).toBeTruthy()
    expect(screen.getByRole('article').getAttribute('lang')).toBe('en')
  })

  it('is a 404 for a slug the definition does not name, without reading anything', async () => {
    for (const doc of ['unknown', 'constructor', '..%2Fsecrets', 'terms-of-service.md']) {
      await expect(LegalDocumentPage({ params: Promise.resolve({ doc }) })).rejects.toThrow('NOT_FOUND')
    }
    expect(readLegalDocument).not.toHaveBeenCalled()
  })

  it('adds the cookies and storage disclosure to the document that carries it, and only there', async () => {
    readLegalDocument.mockResolvedValue(null)

    const { unmount } = await pageFor('privacy-policy')
    expect(screen.getByRole('heading', { name: 'Cookies and storage' })).toBeTruthy()
    unmount()

    await pageFor('terms-of-service')
    expect(screen.queryByRole('heading', { name: 'Cookies and storage' })).toBeNull()
  })
})

describe('generateMetadata', () => {
  it("titles the page with the document's name", async () => {
    getLanguage.mockResolvedValue('en')

    expect(await generateMetadata({ params: Promise.resolve({ doc: 'privacy-policy' }) })).toEqual({
      title: 'Privacy Policy',
    })
  })

  it('adds nothing for a slug that will be a 404', async () => {
    expect(await generateMetadata({ params: Promise.resolve({ doc: 'unknown' }) })).toStrictEqual({})
  })
})
