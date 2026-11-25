import { isAdminHost, siblingOrigin } from '@/lib/hosts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'example.test' } }))

describe('siblingOrigin', () => {
  it.each([
    ['https://example.test', 'api', 'https://api.example.test'],
    ['https://example.test:8443', 'auth', 'https://auth.example.test:8443'],
    ['http://admin.example.test', 'api', 'http://api.example.test'],
    ['https://admin.example.test', null, 'https://example.test'],
    ['https://example.test', 'admin', 'https://admin.example.test'],
    // Only a leading admin. is the admin's: one inside another name stays.
    ['https://notadmin.example.test', 'api', 'https://api.notadmin.example.test'],
  ] as const)('takes %s to its %s neighbour', (origin, sibling, expected) => {
    expect(siblingOrigin(origin, sibling)).toBe(expected)
  })
})

describe('isAdminHost', () => {
  it.each([
    ['admin.example.test', true],
    ['ADMIN.Example.test:8443', true],
    ['example.test', false],
    ['admin.example.test.evil.com', false],
    [null, false],
  ])('says whether %s is the admin', (host, expected) => {
    expect(isAdminHost(host)).toBe(expected)
  })
})
