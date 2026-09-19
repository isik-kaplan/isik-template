import ProfilePasswordPage from '@/app/profile/(tabs)/password/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('ProfilePasswordPage', () => {
  it('renders the change-password form', () => {
    render(<ProfilePasswordPage />)

    expect(screen.getByLabelText('Current password')).toBeTruthy()
    expect(screen.getByLabelText('New password')).toBeTruthy()
  })
})
