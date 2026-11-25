import { palettes } from '@/theme/colors'

describe('palettes', () => {
  it('gives light and dark the same keys, so a component reads one shape', () => {
    expect(Object.keys(palettes.dark)).toEqual(Object.keys(palettes.light))
  })

  it('pins the neutral light and dark values', () => {
    expect(palettes).toEqual({
      light: {
        background: '#ffffff',
        text: '#111111',
        muted: '#666666',
        primary: '#111111',
        onPrimary: '#ffffff',
        error: '#c62828',
        border: '#e0e0e0',
      },
      dark: {
        background: '#121212',
        text: '#ededed',
        muted: '#a0a0a0',
        primary: '#ededed',
        onPrimary: '#121212',
        error: '#ef5350',
        border: '#333333',
      },
    })
  })
})
