import { nameRequirement } from '@/config/names'

import { expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ ACCOUNTS: { NAME_REQUIREMENT: 'full_only' } }))
vi.mock('@/config/public', () => ({ CONFIG, NAME_REQUIREMENTS: [] }))

it('reads the requirement from the public config each time it is asked', () => {
  expect(nameRequirement()).toBe('full_only')
  CONFIG.ACCOUNTS.NAME_REQUIREMENT = 'username_only'
  expect(nameRequirement()).toBe('username_only')
})
