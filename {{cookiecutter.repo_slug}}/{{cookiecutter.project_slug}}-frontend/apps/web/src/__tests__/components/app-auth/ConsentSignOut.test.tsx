import { ConsentSignOut } from '@/components/app-auth/ConsentSignOut'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const logout = vi.fn(async () => ({}))
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({
  AuthApi: class {
    logout = logout
  },
}))
vi.mock('@/lib/authOrigin', () => ({ authOrigin: () => 'https://auth.x.test' }))
const broadcastSessionCleared = vi.fn()
vi.mock('@/lib/sessionChannel', () => ({ broadcastSessionCleared: () => broadcastSessionCleared() }))
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

describe('ConsentSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs this account out and asks again for whoever signs in next', async () => {
    render(<ConsentSignOut username="alice" authorizeUrl="https://auth.x.test/o/authorize/?client_id=c" />)

    expect(screen.getByText(/Not alice\?/).textContent).toBe('Not alice? Sign in as somebody else')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in as somebody else' }))

    expect(logout).toHaveBeenCalled()
    expect(broadcastSessionCleared).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(
      `/auth/login?next=${encodeURIComponent('https://auth.x.test/o/authorize/?client_id=c')}`
    )
  })
})
