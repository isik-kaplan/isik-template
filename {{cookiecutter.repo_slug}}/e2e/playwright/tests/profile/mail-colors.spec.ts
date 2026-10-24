import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { waitForLatestEmailTo } from '../mailpit'

// Mail is only ever drawn light, so the page it is held to has to be too.
test.use({ colorScheme: 'light' })

// MJML inlines the button's color as `background` on its anchor; the other anchors are plain links.
function buttonColorsIn(html: string) {
  const styles = [...html.matchAll(/<a\b[^>]*style="([^"]*)"/gi)].map((match) => match[1])
  const button = styles.find((style) => /(?:^|[;\s])background\s*:/i.test(style))
  if (!button) {
    throw new Error(`No button found among ${styles.length} anchors in the mail body`)
  }
  const property = (name: string) => {
    const found = button.match(new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+)`, 'i'))
    if (!found) {
      throw new Error(`The button carries no ${name}: ${button}`)
    }
    return found[1].trim()
  }
  return { background: property('background'), ink: property('color') }
}

// Compared as pixels: the page answers in the token's color space, the mail in hex.
async function asPixels(page: Page, values: string[]) {
  return page.evaluate((colors: string[]) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    return colors.map((color) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(',')
    })
  }, values)
}

test("a mail's button wears the same colors as the app's primary button", async ({ page }) => {
  const username = `mailcolors-${Date.now()}`
  const email = `${username}@example.test`
  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/auth/signup-email-sent')

  const mail = buttonColorsIn((await waitForLatestEmailTo(email)).HTML)

  await page.goto('/auth/login')
  const onThePage = await page.evaluate(() => {
    // Custom properties come back as authored text, oklch() and all.
    const probe = document.createElement('span')
    probe.style.color = 'var(--primary)'
    probe.style.backgroundColor = 'var(--primary-foreground)'
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    const seen = { primary: style.color, foreground: style.backgroundColor }
    probe.remove()
    return seen
  })

  const [pagePrimary, mailPrimary, pageInk, mailInk] = await asPixels(page, [
    onThePage.primary,
    mail.background,
    onThePage.foreground,
    mail.ink,
  ])

  expect(mailPrimary, "the button's fill is the page's --primary").toBe(pagePrimary)
  expect(mailInk, "and its text is the page's --primary-foreground").toBe(pageInk)
})
