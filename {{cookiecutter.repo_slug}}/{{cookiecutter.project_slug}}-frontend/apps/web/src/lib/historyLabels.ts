import type { Translate } from '@/i18n/config'

// Written out rather than looked up by building a key from the field's name: an assembled key is a
// plain string to the type checker, so a renamed one would only show up rendered as itself.
export function historyFieldLabels(t: Translate): Record<string, string> {
  return {
    username: t('auth:profileDetailsUsernameLabel'),
    email: t('auth:profileDetailsEmailLabel'),
    first_name: t('auth:profileDetailsFirstNameLabel'),
    last_name: t('auth:profileDetailsLastNameLabel'),
    language: t('auth:profileHistoryFieldLanguage'),
    password: t('auth:profileHistoryFieldPassword'),
    last_login: t('auth:profileHistoryFieldLastLogin'),
    is_active: t('auth:profileHistoryFieldActive'),
    is_staff: t('auth:profileHistoryFieldStaff'),
    is_superuser: t('auth:profileHistoryFieldSuperuser'),
  }
}

export function historyActionLabels(t: Translate) {
  return {
    insert: t('auth:profileHistoryActionInsert'),
    update: t('auth:profileHistoryActionUpdate'),
    delete: t('auth:profileHistoryActionDelete'),
  }
}

// Bookkeeping every save touches, which says nothing about what the person changed.
const UNTOLD = new Set(['updated_at'])

/** The fields one event changed, named for a reader. A field nobody wrote a label for keeps its own
 *  name rather than disappearing, so a newly tracked one still shows up. */
export function changedFields(changes: Record<string, unknown> | null, labels: Record<string, string>): string[] {
  return (
    Object.keys(changes ?? {})
      .filter((field) => !UNTOLD.has(field))
      // An own-property check, not `??`: a field named like an Object.prototype member is still a field.
      .map((field) => (Object.hasOwn(labels, field) ? labels[field] : field))
  )
}
