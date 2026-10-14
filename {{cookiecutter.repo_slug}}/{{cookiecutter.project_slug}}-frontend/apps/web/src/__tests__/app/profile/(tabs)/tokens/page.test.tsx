import ProfileTokensPage from '@/app/profile/(tabs)/tokens/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const personalAccessTokens = vi.fn()
const personalAccessTokenScopes = vi.fn()
vi.mock('@/lib/serverApi', () => ({
  serverApi: async () => ({ personalAccessTokens, personalAccessTokenScopes }),
}))
vi.mock('@/components/app-auth/PersonalAccessTokensList', () => ({
  PersonalAccessTokensList: ({ initialTokens, scopes }: { initialTokens: { name: string }[]; scopes: unknown[] }) => (
    <>
      <p>tokens: {initialTokens.map((token) => token.name).join(',')}</p>
      <p>{initialTokens.length} tokens</p>
      <p>scopes: {JSON.stringify(scopes)}</p>
    </>
  ),
}))

describe('ProfileTokensPage', () => {
  beforeEach(() => {
    personalAccessTokens.mockResolvedValue({ data: { results: [{ name: 'CI' }, { name: 'Cron' }] } })
    personalAccessTokenScopes.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
  })

  it('lists their tokens with what they may give one', async () => {
    render(await ProfileTokensPage())

    expect(screen.getByText('tokens: CI,Cron')).toBeTruthy()
    expect(screen.getByText('scopes: [{"name":"users:manage:user","label":"Manage people"}]')).toBeTruthy()
  })

  it('still renders when nothing could be read', async () => {
    personalAccessTokens.mockResolvedValue({ data: undefined })
    personalAccessTokenScopes.mockResolvedValue({ data: undefined })

    render(await ProfileTokensPage())

    expect(screen.getByText('0 tokens')).toBeTruthy()
    expect(screen.getByText('scopes: []')).toBeTruthy()
  })
})
