import { defineConfig, devices } from '@playwright/test'

// No TLS termination in this stack (see the repo README) - the browser talks to nginx over plain
// HTTP, resolved by the e2e-only dnsmasq service (docker-compose.e2e.yml), not a real domain.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 everywhere, not just CI: `docker compose up --build` finishing and a service reporting
  // healthy isn't the same as it being warm - the first request after a fresh boot (Next.js
  // compiling an on-demand route, Django's first lazy import) can occasionally outrun the default
  // per-action timeout even though nothing is actually broken. A real bug fails on retry too.
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://{{ cookiecutter.domain }}',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
