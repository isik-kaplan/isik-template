import { useFilterParams } from '@/components/app/Filters/useFilterParams'

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/profile/details',
  useSearchParams: () => new URLSearchParams(search),
}))

describe('useFilterParams', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it("reads a filter's current word, or '' when it holds none", () => {
    search = 'action=update'
    const { result } = renderHook(() => useFilterParams())

    expect(result.current.held('action')).toBe('update')
    expect(result.current.held('owner')).toBe('')
  })

  it('writes a word into the address bar, keeping the other filters and going back to the first page', () => {
    search = 'owner=ada&page=4'
    const { result } = renderHook(() => useFilterParams())

    result.current.show('action', 'update')

    expect(push).toHaveBeenCalledExactlyOnceWith('/profile/details?owner=ada&action=update')
  })

  it('clears a filter set back to any, or to nothing', () => {
    search = 'action=update&owner=ada'
    const { result } = renderHook(() => useFilterParams())

    result.current.show('action', 'any')
    result.current.show('owner', '')

    expect(push).toHaveBeenNthCalledWith(1, '/profile/details?owner=ada')
    expect(push).toHaveBeenNthCalledWith(2, '/profile/details?action=update')
  })
})
