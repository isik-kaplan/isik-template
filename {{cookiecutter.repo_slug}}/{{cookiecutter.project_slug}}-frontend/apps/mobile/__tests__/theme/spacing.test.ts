import { spacing } from '@/theme/spacing'

describe('spacing', () => {
  it('defines the shared spacing scale', () => {
    expect(spacing).toEqual({ sm: 8, md: 12, lg: 24 })
  })
})
