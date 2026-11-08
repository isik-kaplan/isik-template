import { createApi } from '@/lib/apiClients'
import { broadcastSessionCleared, onSessionCleared } from '@/lib/sessionChannel'

import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

describe('rendered on the server, with no window', () => {
  test('tells no other tab anything, and listens to none', () => {
    const heard = vi.fn()
    const stop = onSessionCleared(heard)
    broadcastSessionCleared()
    stop()
    expect(heard).not.toHaveBeenCalled()
  })

  test.prop([fc.constantFrom('X-Session-Cleared', 'X-Reauthentication-Required', 'X-Other')])(
    'a dead session stops the render with a redirect to login, and nothing else does',
    async (header) => {
      navigation.redirect.mockClear()
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('{}', { status: 200, headers: { [header]: '1', 'Content-Type': 'application/json' } })
        )
      )
      const read = createApi('http://api.test-project.test').me()
      if (header === 'X-Session-Cleared') {
        await expect(read).rejects.toThrow()
        expect(navigation.redirect).toHaveBeenCalledWith('/auth/login')
      } else {
        expect((await read).response.status).toBe(200)
        expect(navigation.redirect).not.toHaveBeenCalled()
      }
    }
  )
})
