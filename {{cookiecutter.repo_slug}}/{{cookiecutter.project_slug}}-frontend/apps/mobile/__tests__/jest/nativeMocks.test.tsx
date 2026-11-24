import { renderHook } from '@testing-library/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

describe('native mocks', () => {
  it('lets a component read safe-area insets without a native provider', async () => {
    const { result } = await renderHook(() => useSafeAreaInsets())

    expect(result.current).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
