import { NameFields } from '@/components'

import { fireEvent, render, screen } from '@testing-library/react-native'

const VALUES = { first_name: 'Ada', last_name: 'Lovelace', username: 'ada' }

describe('NameFields', () => {
  it('shows each field it is given, under its own test id, with its value and placeholder', async () => {
    await render(<NameFields shown={['first_name', 'last_name', 'username']} values={VALUES} onChange={jest.fn()} />)

    const fields = [
      ['first-name-input', 'Ada', 'First name'],
      ['last-name-input', 'Lovelace', 'Last name'],
      ['username-input', 'ada', 'Username'],
    ]
    for (const [testID, value, placeholder] of fields) {
      expect(screen.getByTestId(testID).props.value).toBe(value)
      expect(screen.getByTestId(testID).props.placeholder).toBe(placeholder)
    }
  })

  it('capitalizes names but not a handle', async () => {
    await render(<NameFields shown={['first_name', 'username']} values={VALUES} onChange={jest.fn()} />)

    expect(screen.getByTestId('first-name-input').props.autoCapitalize).toBe('words')
    expect(screen.getByTestId('username-input').props.autoCapitalize).toBe('none')
  })

  it('shows only the fields it is given', async () => {
    await render(<NameFields shown={['username']} values={VALUES} onChange={jest.fn()} />)

    expect(screen.queryByTestId('first-name-input')).toBeNull()
    expect(screen.queryByTestId('last-name-input')).toBeNull()
    expect(screen.getByTestId('username-input')).toBeTruthy()
  })

  it('reports which field changed', async () => {
    const onChange = jest.fn()
    await render(<NameFields shown={['first_name', 'last_name']} values={VALUES} onChange={onChange} />)

    await fireEvent.changeText(screen.getByTestId('last-name-input'), 'King')

    expect(onChange).toHaveBeenCalledWith('last_name', 'King')
  })
})
