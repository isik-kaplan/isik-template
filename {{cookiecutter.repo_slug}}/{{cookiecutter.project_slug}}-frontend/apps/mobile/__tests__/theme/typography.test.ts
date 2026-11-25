import { typography } from '@/theme/typography'

describe('typography', () => {
  it('sizes body, small print and headings, the small print in the body face', () => {
    expect(typography).toEqual({
      body: { fontSize: 16 },
      small: { fontSize: 12 },
      heading: { fontSize: 24, fontWeight: 'bold' },
    })
  })
})
