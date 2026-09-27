import { Screen } from '@/components'

import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

describe('Screen', () => {
  it('renders its children', async () => {
    await render(
      <Screen testID="test-screen">
        <Text>child</Text>
      </Screen>
    )
    expect(screen.getByText('child')).toBeTruthy()
  })

  it('applies the shared full-screen layout', async () => {
    await render(
      <Screen testID="test-screen">
        <Text>child</Text>
      </Screen>
    )
    expect(screen.getByTestId('test-screen').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })
})
