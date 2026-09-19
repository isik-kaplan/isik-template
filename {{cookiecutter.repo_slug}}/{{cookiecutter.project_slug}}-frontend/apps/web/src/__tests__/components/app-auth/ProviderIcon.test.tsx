import { ProviderIcon } from '@/components/app-auth/ProviderIcon'
import { BRAND_ICONS } from '@/components/app-auth/icons/brands'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('ProviderIcon', () => {
  it.each(Object.keys(BRAND_ICONS))('renders the bundled brand icon for %s, ignoring any iconUrl', (providerId) => {
    const { container } = render(<ProviderIcon providerId={providerId} iconUrl="https://example.test/ignored.svg" />)

    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('falls back to iconUrl as an <img> when the provider has no bundled icon', () => {
    const { container } = render(<ProviderIcon providerId="okta" iconUrl="https://example.test/okta.svg" />)

    expect(container.querySelector('svg')).toBeNull()
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.test/okta.svg')
  })

  it('renders nothing for a provider with neither a bundled icon nor an iconUrl', () => {
    const { container } = render(<ProviderIcon providerId="okta" iconUrl="" />)

    expect(container.firstChild).toBeNull()
  })
})
