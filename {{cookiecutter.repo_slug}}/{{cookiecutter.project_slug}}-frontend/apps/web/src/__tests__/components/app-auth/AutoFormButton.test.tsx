import { AutoFormButton } from '@/components/app-auth/AutoFormButton'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Cookies from 'js-cookie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('AutoFormButton', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    Cookies.remove('csrftoken')
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
  })

  afterEach(() => {
    Cookies.remove('csrftoken')
    globalThis.fetch = originalFetch
    // The component appends the form directly to document.body outside React's render tree (a
    // real browser navigation on submit would discard it along with the whole page) - render()'s
    // own cleanup only unmounts what React rendered, so forms would otherwise accumulate.
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('builds and submits a hidden form with the action, method, payload, and CSRF token', async () => {
    Cookies.set('csrftoken', 'abc123')
    const user = userEvent.setup()
    const payload = { client_id: 'xyz' }
    render(
      <AutoFormButton action="https://auth.example.test/o/authorize/" payload={payload}>
        Continue
      </AutoFormButton>
    )

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const form = document.querySelector('form') as HTMLFormElement
    expect(form.action).toBe('https://auth.example.test/o/authorize/')
    expect(form.method).toBe('post')
    expect(form.style.display).toBe('none')
    expect((form.elements.namedItem('client_id') as HTMLInputElement).value).toBe('xyz')
    expect((form.elements.namedItem('csrfmiddlewaretoken') as HTMLInputElement).value).toBe('abc123')
    expect((form.elements.namedItem('csrfmiddlewaretoken') as HTMLInputElement).type).toBe('hidden')
    expect(form.submit).toHaveBeenCalledOnce()
  })

  it('primes the CSRF cookie with a GET first when none is set yet', async () => {
    const user = userEvent.setup()
    render(<AutoFormButton action="https://auth.example.test/o/authorize/">Continue</AutoFormButton>)

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v0/browser/v1/auth/session'),
      expect.objectContaining({ credentials: 'include' })
    )
    // Priming a fresh browser with no cookie yet still submits - just with an empty token, since
    // this mocked fetch doesn't actually set one the way the real session endpoint would.
    const form = document.querySelector('form') as HTMLFormElement
    expect((form.elements.namedItem('csrfmiddlewaretoken') as HTMLInputElement).value).toBe('')
  })

  it('does not prime when a CSRF cookie is already present', async () => {
    Cookies.set('csrftoken', 'abc123')
    const user = userEvent.setup()
    render(<AutoFormButton action="https://auth.example.test/o/authorize/">Continue</AutoFormButton>)

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('respects a custom csrfCookieName and calls the provided onClick', async () => {
    Cookies.set('custom_csrf', 'xyz789')
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <AutoFormButton action="https://auth.example.test/o/authorize/" csrfCookieName="custom_csrf" onClick={onClick}>
        Continue
      </AutoFormButton>
    )

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const form = document.querySelector('form') as HTMLFormElement
    expect((form.elements.namedItem('csrfmiddlewaretoken') as HTMLInputElement).value).toBe('xyz789')
    expect(onClick).toHaveBeenCalledOnce()
    Cookies.remove('custom_csrf')
  })
})
