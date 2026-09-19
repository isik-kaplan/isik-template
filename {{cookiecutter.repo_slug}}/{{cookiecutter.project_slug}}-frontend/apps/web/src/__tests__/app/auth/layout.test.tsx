import AuthLayout from '@/app/auth/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('AuthLayout', () => {
  it('renders its children', () => {
    render(
      <AuthLayout>
        <p>content</p>
      </AuthLayout>
    )

    expect(screen.getByText('content')).toBeTruthy()
  })
})
