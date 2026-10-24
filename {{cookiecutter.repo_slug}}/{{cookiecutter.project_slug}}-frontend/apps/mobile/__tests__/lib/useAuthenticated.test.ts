import { useAuthenticated } from '@/lib/useAuthenticated'

import { renderHook, waitFor } from '@testing-library/react-native'

const mockSession = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ session: mockSession }) }))
const mockSetLanguage = jest.fn()
jest.mock('@/lib/i18n', () => ({ setLanguage: (language: string) => mockSetLanguage(language) }))

describe('useAuthenticated', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('starts null, then resolves to what the session reports', async () => {
    let resolveCheck: (value: { data?: { meta: { is_authenticated: boolean } } }) => void = () => undefined
    mockSession.mockReturnValue(new Promise((resolve) => (resolveCheck = resolve)))
    const { result } = await renderHook(() => useAuthenticated())
    expect(result.current).toBeNull()
    resolveCheck({ data: { meta: { is_authenticated: true } } })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it("resolves to false when the session isn't authenticated", async () => {
    mockSession.mockResolvedValue({ error: { meta: { is_authenticated: false } } })
    const { result } = await renderHook(() => useAuthenticated())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('resolves to false when the session carries no meta at all', async () => {
    mockSession.mockResolvedValue({})
    const { result } = await renderHook(() => useAuthenticated())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('resolves to false when the refusal itself carries no meta', async () => {
    // Kills dropping the "?." in error?.meta, which would throw instead of falling back to false.
    mockSession.mockResolvedValue({ error: {} })
    const { result } = await renderHook(() => useAuthenticated())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it("syncs i18n to the signed-in user's saved language", async () => {
    mockSession.mockResolvedValue({
      data: { meta: { is_authenticated: true }, data: { user: { id: '1', username: 'jane', language: 'en' } } },
    })
    await renderHook(() => useAuthenticated())
    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith('en'))
  })

  it('leaves i18n alone when the user has no saved preference', async () => {
    mockSession.mockResolvedValue({
      data: { meta: { is_authenticated: true }, data: { user: { id: '1', username: 'jane' } } },
    })
    const { result } = await renderHook(() => useAuthenticated())
    await waitFor(() => expect(result.current).toBe(true))
    expect(mockSetLanguage).not.toHaveBeenCalled()
  })

  it('does not update state after unmount', async () => {
    // An unguarded setState after unmount changes nothing visible; only React's warning shows it.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    let resolveCheck: (value: { data?: { meta: { is_authenticated: boolean } } }) => void = () => undefined
    mockSession.mockReturnValue(new Promise((resolve) => (resolveCheck = resolve)))
    const { result, unmount } = await renderHook(() => useAuthenticated())
    await unmount()
    resolveCheck({ data: { meta: { is_authenticated: true } } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
