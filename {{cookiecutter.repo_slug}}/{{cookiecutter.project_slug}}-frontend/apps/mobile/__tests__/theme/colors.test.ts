import { colors } from '@/theme/colors'

describe('colors', () => {
  it('defines the shared palette', () => {
    expect(colors).toEqual({ primary: 'black', onPrimary: 'white', error: 'red', border: '#e0e0e0', muted: '#666666' })
  })
})
