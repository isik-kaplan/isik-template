// Drives app-privacy-policy-generator's page headlessly and prints its Markdown as JSON. The page is served from
// disk through request interception, so nothing leaves the machine.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = '/generator'
const ORIGIN = 'https://generator.invalid'
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}
const POLICIES = {
  simple: { type: 1, element: 'privacy_simple_content' },
  'no-tracking': { type: 2, element: 'privacy_notrack_content' },
  gdpr: { type: 3, element: 'privacy_gdpr_content' },
}

const answers = JSON.parse(process.env.LEGAL_ANSWERS)
const policy = POLICIES[answers.policy]
if (!policy) throw new Error(`unknown policy ${JSON.stringify(answers.policy)}: one of ${Object.keys(POLICIES)}`)

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== ORIGIN) return route.abort()
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '')
    const file = join(ROOT, path === '' || path.endsWith('/') ? `${path}index.html` : path)
    try {
      await route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' })
    } catch {
      await route.fulfill({ status: 404 })
    }
  })
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => typeof window.appState === 'object' && typeof window.convertHtmlToMd === 'function')

  const documents = await page.evaluate(
    async ({ answers, policy }) => {
      const state = window.appState
      const known = state.thirdPartyServices.map((service) => service.name)
      const unknown = answers.services.filter((name) => !known.includes(name))
      if (unknown.length) throw new Error(`the generator lists no ${unknown.join(', ')}; it knows ${known.join(', ')}`)
      for (const service of state.thirdPartyServices) service.enabled = answers.services.includes(service.name)
      state.hasThirdPartyServicesSelected = answers.services.length > 0
      Object.assign(state, {
        appName: answers.appName,
        appContact: answers.contact,
        typeOfApp: 'Free',
        typeOfDev: answers.ownerType,
        devName: answers.ownerType === 'Individual' ? answers.owner : '',
        companyName: answers.ownerType === 'Company' ? answers.owner : '',
        typeOfPolicyInt: policy.type,
      })
      for (const platform of Object.keys(state.platforms)) state.platforms[platform] = answers.platforms.includes(platform)
      if (!window.appWizard.generate()) throw new Error('the generator refused these answers as incomplete')
      await window.Vue.nextTick()
      const markdown = (element) => window.convertHtmlToMd(window.getContent(element)).trim() + '\n'
      return { 'privacy-policy': markdown(policy.element), 'terms-of-service': markdown('tandc_content') }
    },
    { answers, policy }
  )
  process.stdout.write(JSON.stringify(documents))
} finally {
  await browser.close()
}
