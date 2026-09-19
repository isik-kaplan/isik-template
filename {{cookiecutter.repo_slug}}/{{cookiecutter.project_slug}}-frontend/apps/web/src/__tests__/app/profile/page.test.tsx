import ProfilePage from '@/app/profile/page'

import { describe, expect, it, vi } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

describe('ProfilePage', () => {
  it('redirects to the details tab', () => {
    ProfilePage()

    expect(redirect).toHaveBeenCalledWith('/profile/details')
  })
})
