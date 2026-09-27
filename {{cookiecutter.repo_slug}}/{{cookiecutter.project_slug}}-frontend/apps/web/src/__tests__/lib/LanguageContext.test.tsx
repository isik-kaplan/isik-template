import { LanguageProvider, useLanguage } from '@/lib/LanguageContext'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function Probe() {
  return <span>{useLanguage()}</span>
}

describe('LanguageContext', () => {
  it('defaults to English outside any provider', () => {
    render(<Probe />)
    expect(screen.getByText('en')).toBeTruthy()
  })

  it('exposes whatever language the provider was given', () => {
    render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>
    )
    expect(screen.getByText('en')).toBeTruthy()
  })
})
