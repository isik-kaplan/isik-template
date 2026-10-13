import StaffLayout from '@/app/staff/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ requireSession: () => requireSession() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/sessionChannel', () => ({ LOGIN_PATH: '/auth/login', onSessionCleared: () => () => {} }))

describe('StaffLayout', () => {
  it('requires a session before rendering its children', async () => {
    render(await StaffLayout({ children: <p>content</p> }))

    expect(requireSession).toHaveBeenCalledOnce()
    expect(screen.getByText('content')).toBeTruthy()
  })
})
