import { typography } from '@/theme/typography'

describe('typography', () => {
  it('defines the shared heading style', () => {
    expect(typography).toEqual({ heading: { fontSize: 24, fontWeight: 'bold' } })
  })
})
