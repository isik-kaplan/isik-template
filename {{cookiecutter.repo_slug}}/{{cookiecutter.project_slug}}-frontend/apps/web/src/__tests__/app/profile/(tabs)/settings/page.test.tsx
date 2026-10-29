import ProfileSettingsPage from '@/app/profile/(tabs)/settings/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.fn()
const features = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ settings, features }) }))
vi.mock('@/components/app-auth/SettingsList', () => ({
  SettingsList: ({
    initialSettings,
    initialEtag,
    features: held,
  }: {
    initialSettings: { name: string }[]
    initialEtag: string | null
    features: { name: string }[]
  }) => (
    <>
      <p>settings: {initialSettings.map((setting) => setting.name).join(',')}</p>
      <p>etag: {String(initialEtag)}</p>
      <p>features: {held.map((feature) => feature.name).join(',')}</p>
      <p>{initialSettings.length + held.length} in all</p>
    </>
  ),
}))

describe('ProfileSettingsPage', () => {
  beforeEach(() => {
    settings.mockResolvedValue({
      data: [{ name: 'token_lifetime_days' }],
      response: new Response('[]', { headers: { ETag: '"v1"' } }),
    })
    features.mockResolvedValue({ data: [{ name: 'webhooks' }] })
  })

  it('shows their settings under the version they were read at, and their features', async () => {
    render(await ProfileSettingsPage())

    expect(screen.getByText('settings: token_lifetime_days')).toBeTruthy()
    expect(screen.getByText('etag: "v1"')).toBeTruthy()
    expect(screen.getByText('features: webhooks')).toBeTruthy()
  })

  it('still renders, with no version to save against, when nothing could be read', async () => {
    settings.mockResolvedValue({ data: undefined, response: new Response(null, { status: 500 }) })
    features.mockResolvedValue({ data: undefined })

    render(await ProfileSettingsPage())

    expect(screen.getByText('settings:')).toBeTruthy()
    expect(screen.getByText('etag: null')).toBeTruthy()
    expect(screen.getByText('features:')).toBeTruthy()
    expect(screen.getByText('0 in all')).toBeTruthy()
  })
})
