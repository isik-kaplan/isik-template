import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL points the suite at another front door, such as the tls-proxy overlay.
const baseURL = process.env.E2E_BASE_URL ?? 'http://{{ cookiecutter.domain }}'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Healthy isn't warm: a first request after boot can outrun the timeout. A real bug fails on retry too.
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    ignoreHTTPSErrors: baseURL.startsWith('https:'),
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
