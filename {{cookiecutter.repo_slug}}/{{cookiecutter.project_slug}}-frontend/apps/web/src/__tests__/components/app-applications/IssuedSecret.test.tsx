import { IssuedSecret } from '@/components/app-applications/IssuedSecret'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('IssuedSecret', () => {
  it('shows the client id and the secret, saying it is shown once', () => {
    render(<IssuedSecret clientId="the-client" secret="the-secret" />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Copy the client secret now')).toBeTruthy()
    expect(screen.getByText(/shown this once/)).toBeTruthy()
    expect(screen.getByText('Client ID').nextElementSibling?.textContent).toBe('the-client')
    expect(screen.getByText('Client secret').nextElementSibling?.textContent).toBe('the-secret')
  })
})
