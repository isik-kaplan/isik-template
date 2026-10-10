import type { Translate } from '@/i18n/config'
import disclosure from '@/legal/storage.json'

/** The id the disclosure renders under, so the footer can link straight to it. */
export const STORAGE_DISCLOSURE_ANCHOR = 'cookies'

export function storageKindLabels(t: Translate) {
  return {
    cookie: t('legal:storageKindCookie'),
    localStorage: t('legal:storageKindLocalStorage'),
  }
}

export function storagePurposeLabels(t: Translate) {
  return {
    session: t('legal:storagePurposeSession'),
    csrf: t('legal:storagePurposeCsrf'),
    theme: t('legal:storagePurposeTheme'),
  }
}

export type StorageItem = {
  name: string
  kind: keyof ReturnType<typeof storageKindLabels>
  purpose: keyof ReturnType<typeof storagePurposeLabels>
}

/** Every cookie and browser-storage key the site sets. The e2e suite fails on one a real sign-in sets that this
 * list leaves out, so the privacy policy's disclosure, rendered from it, stays true. */
export const STORAGE_ITEMS = disclosure.items as readonly StorageItem[]
