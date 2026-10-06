import { ProfileNameForm } from '@/components/app-auth/ProfileNameForm'
import { EditModeProvider, WhileEditing, WhileReading, useEditMode } from '@/components/app/EditMode'

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/apiOrigin', () => ({ apiOrigin: () => 'http://api.test-project.test' }))

const USER = { username: 'jane', email: 'jane@test.test', first_name: 'Jane', last_name: 'Doe' }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function Start() {
  const { start } = useEditMode()
  return (
    <button type="button" onClick={start}>
      start
    </button>
  )
}

function renderForm(onSaved = vi.fn(), user: Parameters<typeof ProfileNameForm>[0]['user'] = USER) {
  render(
    <EditModeProvider>
      <Start />
      <WhileReading>
        <p>reading</p>
      </WhileReading>
      <WhileEditing>
        <ProfileNameForm user={user} onSaved={onSaved} />
      </WhileEditing>
    </EditModeProvider>
  )
  fireEvent.click(screen.getByText('start'))
  return onSaved
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })
}

describe('ProfileNameForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts from the saved names, with the autocomplete a browser fills names from', () => {
    renderForm()

    const first = screen.getByLabelText('First name') as HTMLInputElement
    const last = screen.getByLabelText('Last name') as HTMLInputElement
    expect([first.value, first.name, first.autocomplete]).toEqual(['Jane', 'first_name', 'given-name'])
    expect([last.value, last.name, last.autocomplete]).toEqual(['Doe', 'last_name', 'family-name'])
  })

  it('starts both names empty for a user the API answered without them', () => {
    renderForm(vi.fn(), { username: 'jane' })

    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe('')
  })

  it('saves both names to the API, hands back the saved user, and goes back to reading', async () => {
    const saved = { ...USER, id: '1', first_name: 'Janet', language: '', created_at: '', updated_at: '' }
    const fetchMock = vi.fn(async (_input: Request) => jsonResponse(200, saved))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const user = userEvent.setup()
    const onSaved = renderForm()

    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Janet')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const request = fetchMock.mock.calls[0][0]
    expect(request.method).toBe('PATCH')
    expect(request.url).toBe('http://api.test-project.test/v0/users/me/')
    expect(await request.json()).toEqual({ first_name: 'Janet', last_name: 'Doe' })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved)
    expect(await screen.findByText('reading')).toBeTruthy()
  })

  it("refuses a name past the database's limit before asking the server", async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    renderForm()

    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'x'.repeat(151) } })
    await save()

    expect(screen.getByText('Use at most 150 characters.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a name right at the limit', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, USER)) as unknown as typeof fetch
    const onSaved = renderForm()

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'x'.repeat(150) } })
    await save()

    expect(onSaved).toHaveBeenCalled()
  })

  it('mints no idempotency key, so it saves even where none could be made', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, USER)) as unknown as typeof fetch
    vi.stubGlobal('crypto', {})
    const onSaved = renderForm()

    await save()

    expect(onSaved).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("shows the server's refusal beside the field it names, and stays editing", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { first_name: ['That name is not allowed.'] })
    ) as unknown as typeof fetch
    const onSaved = renderForm()

    await save()

    expect(screen.getByText('That name is not allowed.')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByText('reading')).toBeNull()
  })

  it('shows a refusal about the whole form under it', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { non_field_errors: ['Try again later.'] })
    ) as unknown as typeof fetch
    renderForm()

    await save()

    expect(screen.getByText('Try again later.')).toBeTruthy()
  })

  it('reports a failure the server did not explain', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    renderForm()

    await save()

    expect(toast.error).toHaveBeenCalledWith('Could not save your details.')
  })
})
