import { SettingsList, lastEnd, parsed, whyOf } from '@/components/app-auth/SettingsList'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

type Props = Parameters<typeof SettingsList>[0]
type Setting = Props['initialSettings'][number]
type Feature = Props['features'][number]

function setting(fields: Partial<Setting>): Setting {
  return {
    name: 'token_lifetime_days',
    type: 'int',
    label: 'Token lifetime',
    description: 'How many days a new token works for.',
    value: 30,
    default: 30,
    origin: 'default',
    forced_reason: null,
    may_change: true,
    minimum: 1,
    maximum: 365,
    ...fields,
  } as Setting
}

const TWO_FACTOR = setting({
  name: 'two_factor_required',
  type: 'bool',
  label: 'Keep two-factor sign-in',
  description: null,
  value: false,
  default: false,
})
const THEME = setting({
  name: 'theme',
  type: 'choice',
  label: 'Theme',
  description: null,
  value: 'light',
  default: 'light',
  choices: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ],
} as Partial<Setting>)

function feature(fields: Partial<Feature>): Feature {
  return {
    name: 'long_lived_tokens',
    label: 'Long-lived tokens',
    description: null,
    held: true,
    grants: [grant(null)],
    ...fields,
  } as Feature
}

function grant(expires_at: string | null) {
  return { starts_at: '2001-01-01T00:00:00Z', expires_at, source: null, reference: null }
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const t = ((key: string, values?: Record<string, string>) =>
  values?.reason ? `${key}(${values.reason})` : key) as never

describe('whyOf', () => {
  it.each([
    [{ origin: 'forced', forced_reason: 'Policy' } as const, 'auth:profileSettingsForcedBecause(Policy)'],
    [{ origin: 'forced', forced_reason: null } as const, 'auth:profileSettingsForced'],
    [{ origin: 'feature_missing' } as const, 'auth:profileSettingsNeedsFeature'],
    [{ origin: 'limited' } as const, 'auth:profileSettingsLimited'],
    [{ origin: 'own' } as const, null],
    [{ origin: 'default' } as const, null],
  ])('explains %o', (fields, expected) => {
    expect(whyOf(setting(fields), t)).toBe(expected)
  })
})

describe('lastEnd', () => {
  it('is the latest end when every grant has one', () => {
    const grants = [grant('2030-01-01T00:00:00Z'), grant('2031-01-01T00:00:00Z'), grant('2029-01-01T00:00:00Z')]
    expect(lastEnd(feature({ grants }))).toBe('2031-01-01T00:00:00.000Z')
  })

  it('is none while any grant never ends, or when there is none', () => {
    const grants = [grant('2030-01-01T00:00:00Z'), grant(null)]
    expect(lastEnd(feature({ grants }))).toBeNull()
    expect(lastEnd(feature({ grants: [] }))).toBeNull()
  })
})

describe('parsed', () => {
  it('reads a number for a number setting, and keeps an empty one for the backend to refuse', () => {
    expect(parsed(setting({ type: 'int' }), '60')).toBe(60)
    expect(parsed(setting({ type: 'float' } as Partial<Setting>), '1.5')).toBe(1.5)
    expect(parsed(setting({ type: 'int' }), '  ')).toBe('  ')
  })

  it('keeps text for anything else', () => {
    expect(parsed(setting({ type: 'text' } as Partial<Setting>), '42')).toBe('42')
  })
})

describe('SettingsList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows each setting with what it is and why, and the features held with when they end', () => {
    render(
      <SettingsList
        initialSettings={[setting({ origin: 'limited', value: 90 }), TWO_FACTOR]}
        initialEtag='"v1"'
        features={[
          feature({}),
          feature({ name: 'beta', label: null, grants: [grant('2030-06-01T00:00:00Z')] }),
          feature({ name: 'webhooks', label: 'Webhooks', held: false }),
        ]}
      />
    )

    expect(screen.getByText('Your settings')).toBeTruthy()
    expect(screen.getByText('Your features')).toBeTruthy()
    // Each in its own line, not run into the label.
    expect(screen.getByText('How many days a new token works for.').className).toContain('text-muted-foreground')
    expect(
      screen.getByText('Kept lower than you chose until you have the feature that allows more.').className
    ).toContain('text-muted-foreground')
    expect((screen.getByLabelText('Token lifetime') as HTMLInputElement).value).toBe('90')
    expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('Long-lived tokens')).toBeTruthy()
    const until = new Date('2030-06-01T00:00:00Z').toLocaleDateString(undefined, { dateStyle: 'medium' })
    expect(screen.getByText(`beta · until ${until}`)).toBeTruthy()
    expect(screen.queryByText('Webhooks')).toBeNull()
  })

  it('says when there are no features, and names a setting by its name when it has no label', () => {
    render(<SettingsList initialSettings={[setting({ label: null })]} initialEtag='"v1"' features={[]} />)

    expect(screen.getByText('No extra features.')).toBeTruthy()
    expect(screen.getByLabelText('token_lifetime_days')).toBeTruthy()
  })

  it('locks a setting staff forced, and says why', () => {
    render(
      <SettingsList
        initialSettings={[
          {
            ...TWO_FACTOR,
            value: true,
            origin: 'forced',
            forced_reason: 'Required here.',
            may_change: false,
          } as Setting,
        ]}
        initialEtag='"v1"'
        features={[]}
      />
    )

    expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Set by staff: Required here.')).toBeTruthy()
  })

  it('saves a switch at once under the version it read, then the version the save answered with', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json()
      return jsonResponse(200, { ...TWO_FACTOR, value: body.value }, { ETag: `"after-${body.value}"` })
    })
    globalThis.fetch = fetchMock as never
    render(<SettingsList initialSettings={[TWO_FACTOR, THEME]} initialEtag='"v1"' features={[]} />)

    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).checked).toBe(true)
    )
    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))

    const [first] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(first.method).toBe('PATCH')
    expect(new URL(first.url).pathname).toBe('/v0/settings/two_factor_required/')
    expect(first.headers.get('If-Match')).toBe('"v1"')
    const [second] = fetchMock.mock.calls[1] as unknown as [Request]
    expect(second.headers.get('If-Match')).toBe('"after-true"')
    expect(await second.json()).toEqual({ type: 'bool', value: false })
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('light')
    expect(toast.success).toHaveBeenCalledWith('Saved.')
  })

  it('saves a choice as soon as it is picked', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ...THEME, value: 'dark' }, { ETag: '"v2"' }))
    globalThis.fetch = fetchMock as never
    render(<SettingsList initialSettings={[THEME]} initialEtag='"v1"' features={[]} />)

    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark')

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ type: 'choice', value: 'dark' })
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('dark')
  })

  it('offers to save a number only once it is changed, and saves it as a number', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, setting({ value: 60, origin: 'own' }), { ETag: '"v2"' }))
    globalThis.fetch = fetchMock as never
    render(<SettingsList initialSettings={[setting({})]} initialEtag='"v1"' features={[]} />)

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await userEvent.clear(screen.getByLabelText('Token lifetime'))
    await userEvent.type(screen.getByLabelText('Token lifetime'), '60')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ type: 'int', value: 60 })
    expect((screen.getByLabelText('Token lifetime') as HTMLInputElement).value).toBe('60')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('reads them again when somebody else changed them first', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(412, { detail: 'stale' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ ...TWO_FACTOR, value: true }], { ETag: '"v9"' }))
    globalThis.fetch = fetchMock as never
    render(<SettingsList initialSettings={[TWO_FACTOR]} initialEtag='"v1"' features={[]} />)

    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))

    expect(toast.error).toHaveBeenCalledWith('Someone else changed this since you opened it. Review their changes.')
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).checked).toBe(true)
    )
  })

  it('keeps what it showed when reading them again fails too', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(412, {}))
      .mockResolvedValueOnce(jsonResponse(500, {})) as never
    render(<SettingsList initialSettings={[TWO_FACTOR]} initialEtag='"v1"' features={[]} />)

    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).checked).toBe(false)
  })

  it.each([
    [{ value: ['Ensure this value is less than or equal to 365.'] }, 'Ensure this value is less than or equal to 365.'],
    [{ detail: 'Staff set this for you.' }, 'Staff set this for you.'],
    [{}, 'That setting could not be saved.'],
    [null, 'That setting could not be saved.'],
  ])("shows the backend's word on what it refused: %o", async (body, words) => {
    globalThis.fetch = vi.fn(async () =>
      body === null ? new Response(null, { status: 409 }) : jsonResponse(409, body)
    ) as never
    render(<SettingsList initialSettings={[TWO_FACTOR]} initialEtag='"v1"' features={[]} />)

    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(words))
  })

  it('sends nothing without a version to name', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as never
    render(<SettingsList initialSettings={[TWO_FACTOR]} initialEtag={null} features={[]} />)

    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('holds a setting still while its own save is on its way', async () => {
    let answer: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))) as never
    render(<SettingsList initialSettings={[TWO_FACTOR, THEME]} initialEtag='"v1"' features={[]} />)

    await userEvent.click(screen.getByLabelText('Keep two-factor sign-in'))

    expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).disabled).toBe(false)
    answer(jsonResponse(200, { ...TWO_FACTOR, value: true }, { ETag: '"v2"' }))
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Keep two-factor sign-in') as HTMLInputElement).disabled).toBe(false)
    )
  })

  it('asks for a number with a number pad and for text with the ordinary keyboard', () => {
    render(
      <SettingsList
        initialSettings={[
          setting({}),
          setting({ name: 'ratio', type: 'float', label: 'Ratio', value: 1.5 } as Partial<Setting>),
          setting({ name: 'nickname', type: 'text', label: 'Nickname', value: 'Al' } as Partial<Setting>),
        ]}
        initialEtag='"v1"'
        features={[]}
      />
    )

    expect(screen.getByLabelText('Ratio').getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByLabelText('Token lifetime').getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByLabelText('Nickname').getAttribute('inputmode')).toBeNull()
    expect((screen.getByLabelText('Nickname') as HTMLInputElement).value).toBe('Al')
  })

  it("holds a number's Save down while its own save is on its way", async () => {
    let answer: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))) as never
    render(<SettingsList initialSettings={[setting({})]} initialEtag='"v1"' features={[]} />)

    await userEvent.type(screen.getByLabelText('Token lifetime'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    answer(jsonResponse(200, setting({ value: 305, origin: 'own' }), { ETag: '"v2"' }))
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull())
  })
})
