import { radii } from '@/theme/radii'

describe('radii', () => {
  it('defines the shared corner radius', () => {
    expect(radii).toEqual({ sm: 8 })
  })
})
