import ProfileLayout from '@/app/profile/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ requireSession: () => requireSession() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/sessionChannel', () => ({ LOGIN_PATH: '/auth/login', onSessionCleared: () => () => {} }))

describe('ProfileLayout', () => {
  it('requires a session before rendering its children', async () => {
    requireSession.mockResolvedValue({ user: { id: '1', username: 'jane', email: 'j@test.test' } })

    render(await ProfileLayout({ children: <p>content</p> }))

    expect(requireSession).toHaveBeenCalledOnce()
    expect(screen.getByText('content')).toBeTruthy()
  })
})
