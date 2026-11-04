import type { NameRequirement } from '@/lib/nameRequirement'
import { handleLogsIn, offeredNames, offeredValues } from '@/lib/names'

let mockRequirement: NameRequirement = 'username_with_optional_full'
jest.mock('@/lib/nameRequirement', () => ({
  get NAME_REQUIREMENT() {
    return mockRequirement
  },
}))

const TABLE: [NameRequirement, string[], boolean][] = [
  ['username_with_optional_full', ['username', 'first_name', 'last_name'], true],
  ['full_only', ['first_name', 'last_name'], false],
  ['full_and_username', ['first_name', 'last_name', 'username'], true],
  ['full_with_optional_username', ['first_name', 'last_name', 'username'], false],
  ['username_only', ['username'], true],
]

describe('names', () => {
  describe.each(TABLE)('%s', (name, offered, byHandle) => {
    beforeEach(() => {
      mockRequirement = name
    })

    it('offers exactly its names, in the order a form asks', () => {
      expect(offeredNames(name)).toEqual(offered)
      expect(offeredNames()).toEqual(offered)
    })

    it('lets a handle log in only when it requires one', () => {
      expect(handleLogsIn(name)).toBe(byHandle)
      expect(handleLogsIn()).toBe(byHandle)
    })

    it('keeps only its names', () => {
      const values = { first_name: 'Jane', last_name: 'Doe', username: 'jane' }
      const kept = Object.fromEntries(offered.map((field) => [field, values[field as keyof typeof values]]))
      expect(offeredValues(values, name)).toEqual(kept)
      expect(offeredValues(values)).toEqual(kept)
    })
  })

  it('is generated as one of the five', () => {
    const { NAME_REQUIREMENT } = jest.requireActual('@/lib/nameRequirement')
    expect(TABLE.map(([name]) => name)).toContain(NAME_REQUIREMENT)
  })
})
