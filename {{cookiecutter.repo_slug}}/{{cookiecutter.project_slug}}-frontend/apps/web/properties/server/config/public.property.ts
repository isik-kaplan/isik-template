import { NAME_REQUIREMENTS } from '@/config/public'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

// PublicConfigScript, unused here, awaits next/server's connection().
vi.mock('next/server', () => ({ connection: vi.fn() }))

describe('the public config', () => {
  test.prop([fc.oneof(fc.constantFrom<string>(...NAME_REQUIREMENTS), fc.string())])(
    'takes a name requirement that is one, and refuses anything else by name',
    async (value) => {
      vi.stubEnv('{{ cookiecutter.config_prefix }}__DOMAIN', 'example.test')
      vi.stubEnv('{{ cookiecutter.config_prefix }}__ACCOUNTS__NAME_REQUIREMENT', value)
      vi.resetModules()
      try {
        const { CONFIG } = await import('@/config/public')
        if ((NAME_REQUIREMENTS as readonly string[]).includes(value)) {
          expect(CONFIG.ACCOUNTS.NAME_REQUIREMENT).toBe(value)
        } else {
          expect(() => CONFIG.ACCOUNTS.NAME_REQUIREMENT).toThrow(
            `ACCOUNTS__NAME_REQUIREMENT is ${JSON.stringify(value)}`
          )
        }
      } finally {
        vi.unstubAllEnvs()
        vi.resetModules()
      }
    }
  )
})
