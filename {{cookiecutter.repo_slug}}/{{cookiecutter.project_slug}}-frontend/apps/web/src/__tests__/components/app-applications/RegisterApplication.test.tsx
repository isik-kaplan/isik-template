import { RegisterApplication } from '@/components/app-applications/RegisterApplication'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const registered = vi.hoisted(() => ({ application: {} as Record<string, unknown> }))
vi.mock('@/components/app-applications/RegisterApplicationForm', () => ({
  RegisterApplicationForm: ({
    scopes,
    onRegistered,
  }: {
    scopes: { name: string }[]
    onRegistered: (application: unknown) => void
  }) => (
    <button onClick={() => onRegistered(registered.application)}>
      register with {scopes.map((scope) => scope.name).join(',')}
    </button>
  ),
}))

describe('RegisterApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hands the form what an application may ask for', () => {
    render(<RegisterApplication scopes={[{ name: 'a:read:x', label: 'Read' }]} />)

    expect(screen.getByRole('button', { name: 'register with a:read:x' })).toBeTruthy()
  })

  it('stops on the secret a confidential application was issued, then leads to it', async () => {
    registered.application = { id: 7, client_id: 'the-client', client_secret: 'the-secret' }
    render(<RegisterApplication scopes={[]} />)

    screen.getByRole('button').click()

    expect(await screen.findByText('the-secret')).toBeTruthy()
    expect(screen.getByText('the-client')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'I have copied it, go to the app' }).getAttribute('href')).toBe(
      '/applications/7'
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('goes straight on to a public application, which has no secret to show', () => {
    registered.application = { id: 8, client_id: 'the-client', client_secret: null }
    render(<RegisterApplication scopes={[]} />)

    screen.getByRole('button').click()

    expect(push).toHaveBeenCalledWith('/applications/8')
  })
})
