import { ListRow } from '@/components'

import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

describe('ListRow', () => {
  it('renders its children', async () => {
    await render(
      <ListRow testID="test-row">
        <Text>content</Text>
      </ListRow>
    )
    expect(screen.getByText('content')).toBeTruthy()
  })

  it('applies the shared row layout', async () => {
    await render(
      <ListRow testID="test-row">
        <Text>content</Text>
      </ListRow>
    )
    expect(screen.getByTestId('test-row').props.style).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
    })
  })
})
