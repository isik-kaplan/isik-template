import { ProviderIcon } from '@/components/app-auth/ProviderIcon'
import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'
import { BRAND_ICONS } from '@/components/app-auth/icons/brands'

import { freshDom } from '../../support/dom'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const config = vi.hoisted(() => ({
  DOMAIN: 'test-project.test',
  SOCIAL_LOGIN: { PROVIDERS: [] as string[], ICONS: [] as string[], ADMIN_ONLY: [] as string[] },
}))
vi.mock('@/config/public', () => ({ CONFIG: config }))

const bundled = Object.keys(BRAND_ICONS)
const unbundled = fc.stringMatching(/^[a-z]{3,10}$/).filter((id) => !bundled.includes(id))

describe("a provider's icon", () => {
  test('is the bundled brand mark for every provider that has one', () => {
    expect(bundled.length).toBeGreaterThan(0)
    for (const id of bundled) {
      freshDom()
      const { container } = render(<ProviderIcon providerId={id} name={id} iconUrl="/ignored.svg" />)
      expect(container.querySelector('svg')).not.toBeNull()
      expect(container.querySelector('img')).toBeNull()
    }
  })

  test.prop([unbundled, fc.option(fc.webUrl(), { nil: '' })])(
    'is the configured picture for any other provider, and nothing without one',
    (id, url) => {
      freshDom()
      const { container } = render(<ProviderIcon providerId={id} name={id} iconUrl={url} />)
      expect(container.querySelector('svg')).toBeNull()
      expect(container.querySelector('img')?.getAttribute('src') ?? '').toBe(url)
    }
  )
})

describe('the social login section', () => {
  test.prop([
    fc.uniqueArray(fc.oneof(fc.constantFrom(...bundled), unbundled), { maxLength: 4 }),
    fc.webUrl(),
    fc.webUrl(),
    fc.option(fc.stringMatching(/^[A-Za-z0-9]{8,16}$/), { nil: null }),
  ])(
    'offers one button per configured provider, each posting its own provider with the CSRF token, or nothing at all',
    async (ids, action, callbackUrl, csrf) => {
      freshDom()
      config.SOCIAL_LOGIN.PROVIDERS = ids
      config.SOCIAL_LOGIN.ICONS = []
      document.cookie = csrf ? `csrftoken=${csrf}; path=/` : 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
      const primed = vi.fn(async () => new Response(null))
      vi.stubGlobal('fetch', primed)
      const submitted: HTMLFormElement[] = []
      const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
        submitted.push(this)
      })
      render(<SocialLoginSection action={action} callbackUrl={callbackUrl} dividerText="or" />)

      const buttons = screen.queryAllByRole('button')
      expect(buttons).toHaveLength(ids.length)
      expect(screen.queryByText('or') !== null).toBe(ids.length > 0)
      for (const [index, button] of buttons.entries()) {
        fireEvent.click(button)
        await vi.waitFor(() => expect(submitted).toHaveLength(index + 1))
        const form = submitted[index]
        expect([form.getAttribute('action'), form.method.toUpperCase()]).toEqual([action, 'POST'])
        const fields = Object.fromEntries([...form.querySelectorAll('input')].map((input) => [input.name, input.value]))
        expect(fields).toEqual({
          provider: ids[index],
          callback_url: callbackUrl,
          process: 'login',
          csrfmiddlewaretoken: csrf ?? '',
        })
      }
      // A first-time visitor has no token yet, so the session endpoint is asked for one first.
      expect(primed).toHaveBeenCalledTimes(csrf ? 0 : ids.length)
      submit.mockRestore()
      for (const form of submitted) form.remove()
    }
  )
})
