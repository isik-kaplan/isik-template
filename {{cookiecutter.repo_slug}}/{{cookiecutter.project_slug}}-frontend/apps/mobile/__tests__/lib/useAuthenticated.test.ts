import { useAuthenticated } from '@/lib/useAuthenticated'

import { renderHook, waitFor } from '@testing-library/react-native'

const mockIsAuthenticated = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ isAuthenticated: mockIsAuthenticated }) }))

describe('useAuthenticated', () => {
  it('starts null, then resolves to what isAuthenticated() reports', async () => {
    let resolveCheck: (value: boolean) => void = () => undefined
    mockIsAuthenticated.mockReturnValue(new Promise<boolean>((resolve) => (resolveCheck = resolve)))
    const { result } = await renderHook(() => useAuthenticated())
    expect(result.current).toBeNull()
    resolveCheck(true)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it("resolves to false when the session isn't authenticated", async () => {
    mockIsAuthenticated.mockResolvedValue(false)
    const { result } = await renderHook(() => useAuthenticated())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('does not update state after unmount', async () => {
    // A spy, not just checking result.current stayed null: an unguarded setState after unmount
    // would still leave result.current looking unchanged (nothing re-reads it), but React itself
    // would warn loudly about updating an unmounted component - that warning is what the
    // `cancelled` guard actually prevents, so it's what proves the guard ran.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    let resolveCheck: (value: boolean) => void = () => undefined
    mockIsAuthenticated.mockReturnValue(new Promise<boolean>((resolve) => (resolveCheck = resolve)))
    const { result, unmount } = await renderHook(() => useAuthenticated())
    await unmount()
    resolveCheck(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
