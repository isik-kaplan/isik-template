import { LanguageSwitcher } from '@/components/app-auth/LanguageSwitcher'

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Forced to one language regardless of what this bake's own cookiecutter "languages" answer was
// - this test is specifically about the below-two-languages guard, not about any particular
// project's configuration.
vi.mock('@/i18n/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/config')>()),
  languages: ['en'],
}))
// useRouter() runs unconditionally (React's own rules-of-hooks) even though this component ends
// up rendering nothing below - it still needs a router context to call.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

describe('LanguageSwitcher (only one language configured)', () => {
  it('renders nothing - there is nothing to switch between', () => {
    const { container } = render(<LanguageSwitcher />)

    expect(container.firstChild).toBeNull()
  })
})
