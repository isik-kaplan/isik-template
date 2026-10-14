import DevicePage from '@/app/device/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({
  getLanguage: async () => 'en',
  requireSession: (redirectTo: string) => requireSession(redirectTo),
}))
const deviceAuthorization = vi.fn()
const delegatableScopes = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ deviceAuthorization, delegatableScopes }) }))
vi.mock('@/components/app/SessionWatcher', () => ({ SessionWatcher: () => <p>watching the session</p> }))
vi.mock('@/components/app-device/DeviceConsent', () => ({
  DeviceConsent: ({ userCode }: { userCode: string }) => <p>answer {userCode}</p>,
}))

const DEVICE = {
  user_code: 'BCDFGHJK',
  application_name: 'Acme CLI',
  application_description: 'Your people, in a terminal.',
  scopes: ['openid', 'users:manage:user', 'other:read:x'],
}

const page = (code?: string | string[]) =>
  DevicePage({ searchParams: Promise.resolve(code === undefined ? {} : { code }) })

const field = () => screen.getByLabelText('Code') as HTMLInputElement

describe('DevicePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
    deviceAuthorization.mockResolvedValue({ data: DEVICE })
    delegatableScopes.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
  })

  it('is not found while the backend signs nobody in to other applications', async () => {
    CONFIG.OAUTH_PROVIDER.MODE = 'off'

    await expect(page('BCDF-GHJK')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireSession).not.toHaveBeenCalled()
  })

  it('asks for the code when it came without one, sending whoever is signed out back here', async () => {
    render(await page())

    expect(requireSession).toHaveBeenCalledWith('/auth/login?next=%2Fdevice')
    expect(deviceAuthorization).not.toHaveBeenCalled()
    expect(delegatableScopes).not.toHaveBeenCalled()
    expect(screen.getByText('Connect a device')).toBeTruthy()
    expect(screen.getByText('Enter the code your device shows.')).toBeTruthy()
    expect(field().value).toBe('')
    expect(field().getAttribute('aria-invalid')).toBeNull()
    expect(field().required).toBe(true)
    expect(field().getAttribute('spellcheck')).toBe('false')
    expect(field().className).toContain('font-mono')
    const form = field().closest('form') as HTMLFormElement
    expect(form.getAttribute('method')).toBe('get')
    expect(form.getAttribute('action')).toBe('/device')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByText('watching the session')).toBeTruthy()
  })

  it('shows what the device asks for, and the code to check, before the answer', async () => {
    render(await page(' bcdf-ghjk '))

    expect(requireSession).toHaveBeenCalledWith('/auth/login?next=%2Fdevice%3Fcode%3Dbcdf-ghjk')
    expect(deviceAuthorization).toHaveBeenCalledWith('bcdf-ghjk')
    expect(screen.getByText('Let Acme CLI in?')).toBeTruthy()
    expect(
      screen.getByText(
        'A device running Acme CLI wants to use your Test Project account. Only allow it if you started this yourself. It will be able to:'
      )
    ).toBeTruthy()
    expect(screen.getByText('Your people, in a terminal.').tagName).toBe('P')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Know who you are',
      'Manage people',
      'other:read:x',
    ])
    expect(screen.getByText('Check that your device shows BCDFGHJK.')).toBeTruthy()
    expect(screen.getByText('answer BCDFGHJK')).toBeTruthy()
    expect(screen.getByText('watching the session')).toBeTruthy()
  })

  it('reads the first code when the address carries several', async () => {
    render(await page(['BCDFGHJK', 'ZZZZZZZZ']))

    expect(deviceAuthorization).toHaveBeenCalledWith('BCDFGHJK')
  })

  it('says nothing of a description the application never gave', async () => {
    deviceAuthorization.mockResolvedValue({ data: { ...DEVICE, application_description: '' } })
    delegatableScopes.mockResolvedValue({ data: undefined })

    render(await page('BCDFGHJK'))

    expect(screen.queryByText('Your people, in a terminal.')).toBeNull()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Know who you are',
      'users:manage:user',
      'other:read:x',
    ])
  })

  it('asks again, keeping what was typed, for a code nobody is waiting on', async () => {
    deviceAuthorization.mockResolvedValue({ data: undefined })

    render(await page('BCDFGHJX'))

    expect(field().value).toBe('BCDFGHJX')
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(
      screen.getByText('That code is wrong, has expired or was already used. Start again on the device.')
    ).toBeTruthy()
  })
})
