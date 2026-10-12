import OAuthAuthorizePage from '@/app/auth/oauth/authorize/page'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'test-project.test' }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'test-project.test' } }))
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

const ASKED = {
  application_name: 'Acme Notes',
  client_id: 'the-client',
  redirect_uri: 'https://client.example.test/callback',
  response_type: 'code',
  scope: 'openid email read:everything',
  state: 'the-state',
  code_challenge: 'the-challenge',
  code_challenge_method: 'S256',
}

async function submitted(name: string) {
  HTMLFormElement.prototype.submit = vi.fn()
  document.cookie = 'csrftoken=the-token'
  await userEvent.click(screen.getByRole('button', { name }))
  const form = document.querySelector('form') as HTMLFormElement
  return { action: form.action, fields: Object.fromEntries(new FormData(form)) }
}

describe('OAuthAuthorizePage', () => {
  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it.each([{ ...ASKED, application_name: undefined }, { ...ASKED, client_id: undefined }, {}])(
    'is not found without an application to ask about',
    async (params) => {
      await expect(OAuthAuthorizePage({ searchParams: Promise.resolve(params) })).rejects.toThrow('NEXT_NOT_FOUND')
    }
  )

  it('names the application and what it would see, in words', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(ASKED) }))

    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('Sign in to Acme Notes')
    expect(screen.getByText(/Acme Notes wants to use your .* account\. It will be able to:/)).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Know who you are',
      'See your email address',
      'read:everything',
    ])
    expect(screen.getByText('You can take this back at any time from your profile.')).toBeTruthy()
  })

  it('allows by posting every field back to the authorize endpoint with a yes', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(ASKED) }))

    const { action, fields } = await submitted('Allow')

    expect(action).toBe('http://auth.test-project.test/o/authorize/')
    expect(fields).toEqual({
      client_id: 'the-client',
      redirect_uri: 'https://client.example.test/callback',
      response_type: 'code',
      scope: 'openid email read:everything',
      state: 'the-state',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
      allow: 'Authorize',
      csrfmiddlewaretoken: 'the-token',
    })
  })

  it('denies by posting the same fields with no yes in them', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(ASKED) }))

    const { fields } = await submitted('Deny')

    expect(fields.allow).toBeUndefined()
    expect(fields.client_id).toBe('the-client')
  })

  it('echoes the optional fields an application sent, and only those', async () => {
    const params = { ...ASKED, nonce: 'n', claims: '{"id_token":{}}', resource: 'https://r.test', state: undefined }
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(params) }))

    const { fields } = await submitted('Allow')

    expect(fields.nonce).toBe('n')
    expect(fields.claims).toBe('{"id_token":{}}')
    expect(fields.resource).toBe('https://r.test')
    expect('state' in fields).toBe(false)
  })

  it('reads the first of a repeated field', async () => {
    const params = { ...ASKED, application_name: ['Acme Notes', 'Evil'], client_id: ['the-client', 'other'] }
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(params) }))

    const { fields } = await submitted('Allow')

    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('Sign in to Acme Notes')
    expect(fields.client_id).toBe('the-client')
  })

  it('lists nothing when no scope is asked for', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve({ ...ASKED, scope: undefined }) }))

    expect(screen.queryAllByRole('listitem')).toEqual([])
  })
})
