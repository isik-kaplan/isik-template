import { expect, test } from '@playwright/test'

// A forged Host must never reach the frontend, whose server-side fetches are built from it.
test('a request naming a host this deployment does not serve is dropped unanswered', async ({ request }) => {
  await expect(request.get('/manifest.webmanifest', { headers: { host: 'unknown.example' } })).rejects.toThrow()

  // Under this deployment's own name it is answered.
  expect((await request.get('/manifest.webmanifest')).status()).toBe(200)
})
