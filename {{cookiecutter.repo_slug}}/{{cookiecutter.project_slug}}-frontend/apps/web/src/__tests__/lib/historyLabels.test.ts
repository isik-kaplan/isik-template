import { echoKeys } from '@/__tests__/support/translate'
import { changedFields, historyActionLabels, historyFieldLabels } from '@/lib/historyLabels'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('historyFieldLabels', () => {
  it('names every tracked field a person would recognize', () => {
    expect(historyFieldLabels(echoKeys)).toEqual({
      username: 'auth:profileDetailsUsernameLabel',
      email: 'auth:profileDetailsEmailLabel',
      first_name: 'auth:profileDetailsFirstNameLabel',
      last_name: 'auth:profileDetailsLastNameLabel',
      language: 'auth:profileHistoryFieldLanguage',
      password: 'auth:profileHistoryFieldPassword',
      last_login: 'auth:profileHistoryFieldLastLogin',
      is_active: 'auth:profileHistoryFieldActive',
      is_staff: 'auth:profileHistoryFieldStaff',
      is_superuser: 'auth:profileHistoryFieldSuperuser',
    })
  })
})

describe('historyActionLabels', () => {
  it('names each action', () => {
    expect(historyActionLabels(echoKeys)).toEqual({
      insert: 'auth:profileHistoryActionInsert',
      update: 'auth:profileHistoryActionUpdate',
      delete: 'auth:profileHistoryActionDelete',
    })
  })
})

describe('changedFields', () => {
  it('names the changed fields it has labels for, keeps the rest by name, and leaves out bookkeeping', () => {
    const changes = { first_name: ['a', 'b'], updated_at: ['x', 'y'], nickname: [null, 'z'] }

    expect(changedFields(changes, { first_name: 'First name' })).toEqual(['First name', 'nickname'])
  })

  it('keeps a field named like an Object.prototype member by its own name', () => {
    expect(changedFields({ constructor: [1, 2] }, {})).toEqual(['constructor'])
    expect(changedFields(JSON.parse('{"__proto__": [1, 2]}'), {})).toEqual(['__proto__'])
  })

  it('reads an event with no changes as none', () => {
    expect(changedFields(null, {})).toEqual([])
  })

  test.prop([fc.uniqueArray(fc.stringMatching(/^[a-z_]{1,10}$/))])(
    'answers one entry per changed field other than updated_at',
    (names) => {
      const changes = Object.fromEntries(names.map((name) => [name, [null, null]]))

      expect(changedFields(changes, {})).toEqual(names.filter((name) => name !== 'updated_at'))
    }
  )
})
