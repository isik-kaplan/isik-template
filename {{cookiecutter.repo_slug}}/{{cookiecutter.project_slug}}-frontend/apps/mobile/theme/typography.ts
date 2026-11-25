// A fontFamily on body (loaded in app/_layout.tsx) reaches every themed text, the small print included.
const body = { fontSize: 16 } as const

export const typography = {
  body,
  small: { ...body, fontSize: 12 },
  heading: { fontSize: 24, fontWeight: 'bold' },
} as const
