import { storedAppearance, useAppearanceChoice } from '@/lib/appearance'

import { act, renderHook, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }))

const getItem = SecureStore.getItemAsync as jest.Mock
const setItem = SecureStore.setItemAsync as jest.Mock

describe('storedAppearance', () => {
  beforeEach(() => jest.resetAllMocks())

  it.each(['system', 'light', 'dark'])('reads a kept %s back', async (kept) => {
    getItem.mockResolvedValue(kept)
    expect(await storedAppearance()).toBe(kept)
    expect(getItem).toHaveBeenCalledWith('appearance')
  })

  it.each([null, 'sepia'])('follows the phone when nothing usable is kept (%s)', async (kept) => {
    getItem.mockResolvedValue(kept)
    expect(await storedAppearance()).toBe('system')
  })
})

describe('useAppearanceChoice', () => {
  beforeEach(() => jest.resetAllMocks())

  it('starts on the phone, then takes what was kept', async () => {
    getItem.mockResolvedValue('dark')
    const { result } = await renderHook(() => useAppearanceChoice())
    await waitFor(() => expect(result.current.appearance).toBe('dark'))
  })

  it('keeps a new choice on the phone, and changes even when keeping fails', async () => {
    getItem.mockResolvedValue(null)
    setItem.mockRejectedValue(new Error('full'))
    const { result } = await renderHook(() => useAppearanceChoice())
    await act(async () => result.current.choose('light'))
    expect([result.current.appearance, setItem.mock.calls]).toEqual(['light', [['appearance', 'light']]])
  })

  it('stays on the phone when the keychain is locked', async () => {
    getItem.mockRejectedValue(new Error('locked'))
    const { result } = await renderHook(() => useAppearanceChoice())
    await act(async () => undefined)
    expect([result.current.appearance, getItem.mock.calls]).toEqual(['system', [['appearance']]])
  })
})
