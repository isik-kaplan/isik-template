import OAuthAuthorizePage from '@/app/auth/oauth/authorize/page'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: '{{ cookiecutter.repo_slug }}.test' }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: '{{ cookiecutter.repo_slug }}.test' } }))
const getSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en', getSession: () => getSession() }))
vi.mock('@/components/app-auth/ConsentSignOut', () => ({
  ConsentSignOut: ({ username, authorizeUrl }: { username: string; authorizeUrl: string }) => (
    <p>
      sign {username} out, then {authorizeUrl}
    </p>
  ),
}))

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
  beforeEach(() => {
    getSession.mockResolvedValue(null)
  })

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
    // Nothing said about what it does is nothing shown, not an empty line.
    expect([...document.querySelectorAll('p')].some((line) => line.textContent === '')).toBe(false)
  })

  it('allows by posting every field back to the authorize endpoint with a yes', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(ASKED) }))

    const { action, fields } = await submitted('Allow')

    expect(action).toBe('http://auth.{{ cookiecutter.repo_slug }}.test/o/authorize/')
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

  it("says what the application does, and words a permission it asks for in the backend's words", async () => {
    const params = {
      ...ASKED,
      scope: 'openid users:manage:user',
      application_description: 'Notes about people',
      scopes_descriptions: '["Who you are", "Manage people"]',
    }
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(params) }))

    expect(screen.getByText('Notes about people')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Know who you are',
      'Manage people',
    ])
  })

  it.each([
    ['not JSON at all', '{nope'],
    ['not a list', '{"0": "Manage people"}'],
  ])('shows a permission as it is when its words are %s', async (_case, scopes_descriptions) => {
    const params = { ...ASKED, scope: 'users:manage:user', scopes_descriptions }
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(params) }))

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['users:manage:user'])
  })

  it('words a scope the backend left out of its list as it is', async () => {
    const params = { ...ASKED, scope: 'openid users:manage:user', scopes_descriptions: '["Who you are"]' }
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(params) }))

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Know who you are',
      'users:manage:user',
    ])
  })

  it('lets somebody signed in be somebody else, asked the same question again', async () => {
    getSession.mockResolvedValue({ user: { username: 'alice' } })
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(ASKED) }))

    const again = new URLSearchParams({
      client_id: 'the-client',
      redirect_uri: 'https://client.example.test/callback',
      response_type: 'code',
      scope: 'openid email read:everything',
      state: 'the-state',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
    })
    expect(
      screen.getByText(`sign alice out, then http://auth.{{ cookiecutter.repo_slug }}.test/o/authorize/?${again.toString()}`)
    ).toBeTruthy()
  })

  it('offers nobody signed in to sign out', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve(ASKED) }))

    expect(screen.queryByText(/sign .* out/)).toBeNull()
    expect(screen.queryByText('Notes about people')).toBeNull()
  })

  it('lists nothing when no scope is asked for', async () => {
    render(await OAuthAuthorizePage({ searchParams: Promise.resolve({ ...ASKED, scope: undefined }) }))

    expect(screen.queryAllByRole('listitem')).toEqual([])
  })
})
