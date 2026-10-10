import disclosure from '@/legal/storage.json'
import {
  STORAGE_DISCLOSURE_ANCHOR,
  STORAGE_ITEMS,
  storageKindLabels,
  storagePurposeLabels,
} from '@/lib/storageDisclosure'

import { echoKeys } from '../support/translate'
import { describe, expect, it } from 'vitest'

describe('STORAGE_ITEMS', () => {
  it('is the disclosure list', () => {
    expect(STORAGE_ITEMS).toEqual(disclosure.items)
  })

  it('names every item once', () => {
    const names = STORAGE_ITEMS.map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("discloses the session and CSRF cookies the app's own code reads by name", () => {
    const cookies = STORAGE_ITEMS.filter(({ kind }) => kind === 'cookie').map(({ name }) => name)
    expect(cookies).toEqual(expect.arrayContaining(['sessionid', 'csrftoken']))
  })

  it('has a label for every kind and purpose it uses', () => {
    const kinds = storageKindLabels(echoKeys)
    const purposes = storagePurposeLabels(echoKeys)
    for (const item of STORAGE_ITEMS) {
      expect(Object.hasOwn(kinds, item.kind)).toBe(true)
      expect(Object.hasOwn(purposes, item.purpose)).toBe(true)
    }
  })
})

describe('labels', () => {
  it('reach for each kind and purpose by its own key', () => {
    expect(storageKindLabels(echoKeys)).toEqual({
      cookie: 'legal:storageKindCookie',
      localStorage: 'legal:storageKindLocalStorage',
    })
    expect(storagePurposeLabels(echoKeys)).toEqual({
      session: 'legal:storagePurposeSession',
      csrf: 'legal:storagePurposeCsrf',
      theme: 'legal:storagePurposeTheme',
    })
  })
})

describe('STORAGE_DISCLOSURE_ANCHOR', () => {
  it('is the fragment the footer links to', () => {
    expect(STORAGE_DISCLOSURE_ANCHOR).toBe('cookies')
  })
})
