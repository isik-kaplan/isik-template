import { SiteSettingsForm } from '@/components/app-admin/SiteSettingsForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

type Settings = Parameters<typeof SiteSettingsForm>[0]['settings']
const SETTINGS = { login_policy: 'everyone', signed_out: null } as unknown as Settings
const ETAG = '"3"'

const rung = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement

function answering(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  )
  globalThis.fetch = fetchMock
  return async () => (fetchMock.mock.calls[0] as unknown as [Request])[0]
}

describe('SiteSettingsForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts on the rung saved, holding the top one back from somebody below superuser', () => {
    const staff = { ...SETTINGS, login_policy: 'staff' as const }
    render(<SiteSettingsForm settings={staff} etag={ETAG} isSuperuser={false} />)

    expect(rung('Staff and superusers').checked).toBe(true)
    expect(rung('Superusers only').disabled).toBe(true)
    expect([rung('Everyone').disabled, rung('Staff and superusers').disabled]).toEqual([false, false])
    expect(screen.getByRole('group', { name: 'Who may sign in' })).toBeTruthy()
    expect(screen.getByText(/^Raising it signs out everybody it no longer admits/)).toBeTruthy()
    expect(screen.getByText(/^Leave this off during a breach/)).toBeTruthy()
  })

  it('reads settings whose answer left the rung unsaid as letting everyone in', () => {
    const unsaid = { ...SETTINGS, login_policy: undefined }
    render(<SiteSettingsForm settings={unsaid} etag={ETAG} isSuperuser />)

    expect(rung('Everyone').checked).toBe(true)
    expect(rung('Superusers only').disabled).toBe(false)
  })

  it('raises the ladder against the version it opened on, saying how many it signed out', async () => {
    const sent = answering(200, { ...SETTINGS, login_policy: 'superusers', signed_out: 2 })
    render(<SiteSettingsForm settings={SETTINGS} etag={ETAG} isSuperuser />)

    await userEvent.click(rung('Superusers only'))
    await userEvent.click(screen.getByRole('checkbox', { name: /Email the people this signs out/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const request = await sent()
    expect(request.method).toBe('PATCH')
    expect(new URL(request.url).pathname).toBe('/v0/site-settings/')
    expect(request.headers.get('If-Match')).toBe('"3"')
    expect(await request.json()).toEqual({ login_policy: 'superusers', mail_the_people_signed_out: true })
    expect(toast.success).toHaveBeenCalledWith('Saved. 2 sessions signed out.')
    expect(refresh).toHaveBeenCalled()
  })

  it('counts nobody signed out where the answer did not say', async () => {
    answering(200, SETTINGS)
    render(<SiteSettingsForm settings={SETTINGS} etag={ETAG} isSuperuser />)

    await userEvent.click(rung('Staff and superusers'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.success).toHaveBeenCalledWith('Saved. 0 sessions signed out.')
  })

  it('reads the page again when somebody else changed them since it loaded', async () => {
    answering(412, { detail: 'Changed.', code: 'precondition_failed', current: SETTINGS })
    render(<SiteSettingsForm settings={SETTINGS} etag={ETAG} isSuperuser />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('says so in its own words when saving fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<SiteSettingsForm settings={SETTINGS} etag={ETAG} isSuperuser />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.error).toHaveBeenCalledWith('Could not save the settings.')
  })
})
