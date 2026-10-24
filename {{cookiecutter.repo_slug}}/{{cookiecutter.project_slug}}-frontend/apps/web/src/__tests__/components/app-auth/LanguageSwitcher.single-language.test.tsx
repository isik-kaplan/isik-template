import { LanguageSwitcher } from '@/components/app-auth/LanguageSwitcher'

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Forced to one language, whatever this project configures: this tests the below-two guard.
vi.mock('@/i18n/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/config')>()),
  languages: ['en'],
}))
// useRouter() runs even though nothing renders.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

describe('LanguageSwitcher (only one language configured)', () => {
  it('renders nothing - there is nothing to switch between', () => {
    const { container } = render(<LanguageSwitcher />)

    expect(container.firstChild).toBeNull()
  })
})
