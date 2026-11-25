import { Screen } from '@/components'

import { look } from '@/theme'

import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }))

describe('Screen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders its children in the shared layout, scrolling when they run long', async () => {
    await render(
      <Screen testID="test-screen">
        <Text>child</Text>
      </Screen>
    )
    const scroller = screen.getByTestId('test-screen')
    expect(screen.getByText('child')).toBeTruthy()
    expect([scroller.props.contentContainerStyle, scroller.props.keyboardShouldPersistTaps]).toEqual([
      look.screen(),
      'handled',
    ])
  })

  it('offers no way back unless asked', async () => {
    await render(<Screen testID="test-screen">{null}</Screen>)
    expect(screen.queryByTestId('back-button')).toBeNull()
  })

  it('goes back from its back bar', async () => {
    await render(
      <Screen testID="test-screen" back>
        {null}
      </Screen>
    )
    expect(screen.getByText('Back')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('back-button'))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
