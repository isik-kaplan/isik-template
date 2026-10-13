import ApplicationsLayout from '@/app/applications/layout'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ requireSession: () => requireSession() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/sessionChannel', () => ({ LOGIN_PATH: '/auth/login', onSessionCleared: () => () => {} }))

describe('ApplicationsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
  })

  it('requires a session before rendering its children', async () => {
    render(await ApplicationsLayout({ children: <p>content</p> }))

    expect(requireSession).toHaveBeenCalledOnce()
    expect(screen.getByText('content')).toBeTruthy()
  })

  it('is not found while there are no applications here', async () => {
    CONFIG.OAUTH_PROVIDER.MODE = 'off'

    await expect(ApplicationsLayout({ children: <p>content</p> })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireSession).not.toHaveBeenCalled()
  })
})
