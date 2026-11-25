// Same keys in both, so a component reads one shape whatever the scheme.
export const palettes = {
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
} as const

export type Palette = { [K in keyof (typeof palettes)['light']]: string }
