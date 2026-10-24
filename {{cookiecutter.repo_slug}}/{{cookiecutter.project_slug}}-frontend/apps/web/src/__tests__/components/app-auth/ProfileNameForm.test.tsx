import { ProfileNameForm } from '@/components/app-auth/ProfileNameForm'
import { EditModeProvider, WhileEditing, WhileReading, useEditMode } from '@/components/app/EditMode'

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/apiOrigin', () => ({ apiOrigin: () => 'http://api.test-project.test' }))

// As the API answers: the version only ever in the ETag header, never in the body.
const ANSWERED = { username: 'jane', email: 'jane@test.test', first_name: 'Jane', last_name: 'Doe' }
const USER = { ...ANSWERED, etag: '"1"' }

function jsonResponse(status: number, body: unknown, etag?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (etag) headers.ETag = etag
  return new Response(JSON.stringify(body), { status, headers })
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
    renderForm(vi.fn(), { username: 'jane', etag: '"1"' })

    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe('')
  })

  it('saves both names to the API, hands back the saved user with its new version, and goes back to reading', async () => {
    const saved = { ...ANSWERED, id: '1', first_name: 'Janet', language: '', created_at: '', updated_at: '' }
    const fetchMock = vi.fn(async (_input: Request) => jsonResponse(200, saved, '"2"'))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const user = userEvent.setup()
    const onSaved = renderForm()

    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Janet')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const request = fetchMock.mock.calls[0][0]
    expect(request.method).toBe('PATCH')
    expect(request.url).toBe('http://api.test-project.test/v0/users/me/')
    expect(request.headers.get('If-Match')).toBe('"1"')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request.json()).toEqual({ first_name: 'Janet', last_name: 'Doe' })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({ ...saved, etag: '"2"' })
    expect(await screen.findByText('reading')).toBeTruthy()
  })

  describe('saved somewhere else since it opened', () => {
    const THEIRS = { ...ANSWERED, first_name: 'Jo' }

    function refusedThenSaved() {
      const fetchMock = vi.fn(async (_input: Request) =>
        fetchMock.mock.calls.length === 1
          ? jsonResponse(412, { detail: 'Changed.', code: 'precondition_failed', current: THEIRS }, '"2"')
          : jsonResponse(200, { ...ANSWERED, first_name: 'Janet' }, '"3"')
      )
      globalThis.fetch = fetchMock as unknown as typeof fetch
      return fetchMock
    }

    async function editAndSave() {
      const user = userEvent.setup()
      await user.clear(screen.getByLabelText('First name'))
      await user.type(screen.getByLabelText('First name'), 'Janet')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      return user
    }

    it('says so and offers their version or this one, still editing', async () => {
      refusedThenSaved()
      const onSaved = renderForm()

      await editAndSave()

      expect(screen.getByRole('alert').textContent).toContain('Someone else saved this since you opened it.')
      expect(toast.error).toHaveBeenCalledWith('Someone else changed this since you opened it. Review their changes.')
      expect(onSaved).not.toHaveBeenCalled()
      expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Janet')
    })

    it('takes their version into the form', async () => {
      refusedThenSaved()
      renderForm()
      const user = await editAndSave()

      await user.click(screen.getByRole('button', { name: 'Use their version' }))

      expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Jo')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('saves this one over theirs, against their version', async () => {
      const fetchMock = refusedThenSaved()
      const onSaved = renderForm()
      const user = await editAndSave()

      await user.click(screen.getByRole('button', { name: 'Save mine over it' }))

      const request = fetchMock.mock.calls[1][0]
      expect(request.headers.get('If-Match')).toBe('"2"')
      expect(await request.json()).toEqual({ first_name: 'Janet', last_name: 'Doe' })
      expect(onSaved).toHaveBeenCalled()
    })
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
