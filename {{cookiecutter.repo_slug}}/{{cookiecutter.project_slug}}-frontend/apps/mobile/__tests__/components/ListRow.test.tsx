import { ListRow } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

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

  it('takes the shared row look from the theme', async () => {
    await render(
      <ListRow testID="test-row">
        <Text>content</Text>
      </ListRow>,
      inTheDark
    )
    expect(screen.getByTestId('test-row').props.style).toEqual(look.row(themeOf('dark')))
  })
})
