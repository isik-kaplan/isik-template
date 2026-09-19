import { AuthCard, AuthCardFooterLink, AuthCenteredLayout } from '@/components/app-auth/AuthCard'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('AuthCenteredLayout', () => {
  it('renders its children', () => {
    render(
      <AuthCenteredLayout>
        <p>content</p>
      </AuthCenteredLayout>
    )

    expect(screen.getByText('content')).toBeTruthy()
  })
})

describe('AuthCard', () => {
  it('renders the title, children and footer', () => {
    render(
      <AuthCard title="Log in" footer={<p>footer</p>}>
        <p>body</p>
      </AuthCard>
    )

    expect(screen.getByText('Log in')).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
    expect(screen.getByText('footer')).toBeTruthy()
  })

  it('renders a description only when given one', () => {
    const { container, rerender } = render(
      <AuthCard title="Log in" description="Welcome back">
        <p>body</p>
      </AuthCard>
    )
    expect(screen.getByText('Welcome back')).toBeTruthy()

    rerender(
      <AuthCard title="Log in">
        <p>body</p>
      </AuthCard>
    )
    expect(container.querySelector('[data-slot="card-description"]')).toBeNull()
  })
})

describe('AuthCardFooterLink', () => {
  it('renders a link to the given href, with any extra classes appended', () => {
    render(
      <AuthCardFooterLink href="/auth/login" className="text-center">
        Back to login
      </AuthCardFooterLink>
    )

    const link = screen.getByRole('link', { name: 'Back to login' })
    expect(link.getAttribute('href')).toBe('/auth/login')
    expect(link.className).toContain('text-primary')
    expect(link.className).toContain('text-center')
  })
})
