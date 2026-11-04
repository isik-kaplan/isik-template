import { NAME_FIELDS, NAME_TABLE } from '@/__tests__/support/names'
import type { NameRequirement } from '@/config/names'
import { editableNames, handleLogsIn, isNameRequired, offeredNames, personLabel } from '@/lib/names'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const requirement = vi.hoisted(() => ({ current: 'username_with_optional_full' as NameRequirement }))
vi.mock('@/config/names', () => ({
  get NAME_REQUIREMENT() {
    return requirement.current
  },
}))

describe('names', () => {
  beforeEach(() => {
    requirement.current = 'username_with_optional_full'
  })

  describe.each(NAME_TABLE)('%s', (name, offered, required) => {
    it('offers exactly its names, in the order a form asks', () => {
      expect(offeredNames(name)).toEqual(offered)
    })

    it('requires exactly its required names', () => {
      expect(NAME_FIELDS.filter((field) => isNameRequired(field, name))).toEqual(
        NAME_FIELDS.filter((field) => required.includes(field))
      )
    })

    it('lets a handle log in only when it requires one', () => {
      expect(handleLogsIn(name)).toBe(required.includes('username'))
    })

    it('reads the generated requirement when asked for none', () => {
      requirement.current = name
      expect(offeredNames()).toEqual(offered)
      expect(isNameRequired('username')).toBe(required.includes('username'))
      expect(handleLogsIn()).toBe(required.includes('username'))
    })

    it('leaves a chosen handle out of what can still be changed', () => {
      expect(editableNames({ username: 'jane' }, name)).toEqual(offered.filter((field) => field !== 'username'))
      expect(editableNames({ username: null }, name)).toEqual(offered)
      expect(editableNames({}, name)).toEqual(offered)
    })
  })

  it('reads the generated requirement for what can still be changed', () => {
    requirement.current = 'full_only'
    expect(editableNames({})).toEqual(['first_name', 'last_name'])
  })

  describe('personLabel', () => {
    it('prefers the full name', () => {
      expect(personLabel({ first_name: 'Jane', last_name: 'Doe', username: 'jd', email: 'j@test.test' })).toBe(
        'Jane Doe'
      )
    })

    it('takes either half of a name alone, without a stray space', () => {
      expect(personLabel({ first_name: 'Jane', last_name: '', username: 'jd', email: 'j@test.test' })).toBe('Jane')
      expect(personLabel({ first_name: '', last_name: 'Doe', username: 'jd', email: 'j@test.test' })).toBe('Doe')
    })

    it('falls back to the handle, then the address', () => {
      expect(personLabel({ first_name: '', last_name: '', username: 'jd', email: 'j@test.test' })).toBe('jd')
      expect(personLabel({ username: null, email: 'j@test.test' })).toBe('j@test.test')
      expect(personLabel({ username: '', email: 'j@test.test' })).toBe('j@test.test')
    })
  })

  it('is generated as one of the five', async () => {
    const { NAME_REQUIREMENT } = await vi.importActual<typeof import('@/config/names')>('@/config/names')
    expect(NAME_TABLE.map(([name]) => name)).toContain(NAME_REQUIREMENT)
  })
})
