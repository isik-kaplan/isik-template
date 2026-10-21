import { PATH_HEADER, TOO_MANY_REQUESTS_PATH, tooManyRequestsPage } from '@/lib/tooManyRequests'

import { describe, expect, it, vi } from 'vitest'

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirected to ${to}`)
  })
)
vi.mock('next/navigation', () => ({ redirect }))

function answering(status: number) {
  return vi.fn(async () => new Response('{}', { status }))
}

describe('tooManyRequestsPage', () => {
  it('sends the visitor to wait, offering the page they were on', async () => {
    const fetch = tooManyRequestsPage(new Headers({ [PATH_HEADER]: '/staff/people?page=2' }), answering(429))

    await expect(fetch('http://api.test.test/')).rejects.toThrow()

    expect(TOO_MANY_REQUESTS_PATH).toBe('/too-many-requests')
    expect(redirect).toHaveBeenLastCalledWith('/too-many-requests?next=%2Fstaff%2Fpeople%3Fpage%3D2')
  })

  it('offers nothing to go back to when it does not know the page', async () => {
    await expect(tooManyRequestsPage(new Headers(), answering(429))('http://api.test.test/')).rejects.toThrow()

    expect(redirect).toHaveBeenLastCalledWith('/too-many-requests')
  })

  it('hands back every other answer as it came', async () => {
    redirect.mockClear()
    const response = await tooManyRequestsPage(new Headers(), answering(403))('http://api.test.test/', {})

    expect(response.status).toBe(403)
    expect(redirect).not.toHaveBeenCalled()
  })
})
