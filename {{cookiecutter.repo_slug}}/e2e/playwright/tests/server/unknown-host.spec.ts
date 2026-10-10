import { expect, test } from '@playwright/test'

// nginx's default server drops a Host none of its blocks name, so a forged one never reaches the
// frontend, whose server-side fetches are built from the host it is handed.
test('a request naming a host this deployment does not serve is dropped unanswered', async ({ request }) => {
  await expect(request.get('/manifest.webmanifest', { headers: { host: 'unknown.example' } })).rejects.toThrow()

  // The same request under this deployment's own name is answered, so the refusal is the host's alone.
  expect((await request.get('/manifest.webmanifest')).status()).toBe(200)
})
