import { look, themeOf } from '@/theme'

const LIGHT = themeOf('light')
const DARK = themeOf('dark')

describe('look', () => {
  it('lays out a screen and its back bar the same in either scheme', () => {
    expect([look.screen(), look.backBar(), look.link()]).toEqual([
      { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
      { flexDirection: 'row' },
      { textDecorationLine: 'underline' },
    ])
  })

  it('draws text from the light palette', () => {
    expect({
      text: look.text(LIGHT),
      muted: look.muted(LIGHT),
      heading: look.heading(LIGHT),
      buttonLabel: look.buttonLabel(LIGHT),
      textButton: look.textButton(LIGHT),
      chosen: look.chosen(LIGHT),
      error: look.error(LIGHT),
      notice: look.notice(LIGHT),
    }).toEqual({
      text: { fontSize: 16, color: '#111111' },
      muted: { fontSize: 16, color: '#666666' },
      heading: { fontSize: 24, fontWeight: 'bold', color: '#111111' },
      buttonLabel: { fontSize: 16, color: '#ffffff' },
      textButton: { fontSize: 16, color: '#111111', fontWeight: '600' },
      chosen: { fontSize: 16, color: '#111111', fontWeight: '600', textDecorationLine: 'underline' },
      error: { fontSize: 16, color: '#c62828' },
      notice: { fontSize: 12, color: '#666666', textAlign: 'center' },
    })
  })

  it('draws boxes from the light palette', () => {
    expect({ button: look.button(LIGHT), field: look.field(LIGHT), row: look.row(LIGHT) }).toEqual({
      button: { backgroundColor: '#111111', borderRadius: 8, padding: 12, alignItems: 'center' },
      field: { fontSize: 16, color: '#111111', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 12 },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
      },
    })
  })

  it('takes every colour from the dark palette in the dark', () => {
    const { colors } = DARK
    expect([
      look.text(DARK).color,
      look.muted(DARK).color,
      look.heading(DARK).color,
      look.button(DARK).backgroundColor,
      look.buttonLabel(DARK).color,
      look.textButton(DARK).color,
      look.chosen(DARK).color,
      look.field(DARK).color,
      look.field(DARK).borderColor,
      look.error(DARK).color,
      look.row(DARK).borderBottomColor,
      look.notice(DARK).color,
    ]).toEqual([
      colors.text,
      colors.muted,
      colors.text,
      colors.primary,
      colors.onPrimary,
      colors.primary,
      colors.primary,
      colors.text,
      colors.border,
      colors.error,
      colors.border,
      colors.muted,
    ])
  })
})
