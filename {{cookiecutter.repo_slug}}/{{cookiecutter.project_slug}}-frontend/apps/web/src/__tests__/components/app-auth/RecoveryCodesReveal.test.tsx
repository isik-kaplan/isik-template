import { RecoveryCodesReveal } from '@/components/app-auth/RecoveryCodesReveal'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('RecoveryCodesReveal', () => {
  it('lists every code under a warning that this is the only time they show', () => {
    render(<RecoveryCodesReveal codes={['1111-2222', '3333-4444']} />)

    const region = screen.getByRole('region', { name: 'Your recovery codes' })
    expect(within(region).getByText('Your recovery codes').tagName).toBe('P')
    expect(within(region).getByText(/won't be shown again/)).toBeTruthy()
    expect(
      within(region)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['1111-2222', '3333-4444'])
  })
})
