import { permissionLabels } from '@/lib/permissionLabels'

import { describe, expect, it } from 'vitest'

const DECLARED = [
  { name: 'users:manage:user', label: 'Manage people' },
  { name: 'users:grant:rights', label: 'Change what other people may do' },
]

describe('permissionLabels', () => {
  it('words each name as its declaration does, in the order given', () => {
    expect(permissionLabels(['users:grant:rights', 'users:manage:user'], DECLARED)).toEqual([
      'Change what other people may do',
      'Manage people',
    ])
  })

  it('shows a name nothing declares, or that could not be read, as it is', () => {
    expect(permissionLabels(['gone:old:perm'], DECLARED)).toEqual(['gone:old:perm'])
    expect(permissionLabels(['users:manage:user'], undefined)).toEqual(['users:manage:user'])
  })

  it('is nothing for nothing given', () => {
    expect(permissionLabels(undefined, DECLARED)).toEqual([])
  })
})
