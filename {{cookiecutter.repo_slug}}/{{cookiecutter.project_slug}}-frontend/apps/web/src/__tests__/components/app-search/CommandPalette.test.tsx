import { CommandPalette } from '@/components/app-search/CommandPalette'

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'off' } }))
vi.mock('@/config/public', () => ({ CONFIG }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const STAFF = { id: 'u0', username: 'root', is_staff: true, is_superuser: false, permissions: [] }
// The pages staff reach beyond everybody's, with the apps switched off.
const STAFF_PAGES = ['People'{% if cookiecutter.webhooks != "none" %}, 'Webhooks'{% endif %}]
// What staff search, in order, with the apps switched off.
const STAFF_SEARCHES = ['/v0/users/', '/v0/notifications/inbox/'{% if cookiecutter.webhooks != "none" %}, '/v0/notifications/endpoints/'{% endif %}]

// Answers /users/me/ with `who`, and each list endpoint with `rows` for its path.
function serve(who: unknown, rows: Record<string, unknown[]> = {}) {
  const fetchMock = vi.fn(async (request: Request) => {
    const { pathname } = new URL(request.url)
    if (pathname === '/v0/users/me/') return who ? jsonResponse(200, who) : jsonResponse(500, {})
    return jsonResponse(200, { results: rows[pathname] ?? [] })
  })
  globalThis.fetch = fetchMock as never
  return fetchMock
}

const searched = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([request]) => new URL((request as Request).url))
    .filter((url) => url.pathname !== '/v0/users/me/')

const field = () => screen.getByRole('searchbox', { name: 'Find a page or a record' })
const options = () => screen.queryAllByRole('option').map((option) => option.textContent)
const selected = () => screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true')

async function opened() {
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  return field()
}

describe('CommandPalette', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.OAUTH_PROVIDER.MODE = 'off'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('opens on its button, offering every page this person may reach once it knows who they are', async () => {
    serve(STAFF)
    render(<CommandPalette />)
    expect(screen.queryByRole('dialog')).toBeNull()

    await opened()

    const dialog = screen.getByRole('dialog', { name: 'Go to or find' })
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      "Type a page's name, or words to find records. Narrow with field:value, like is_staff:true."
    )
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull()
    expect(field().getAttribute('placeholder')).toBe('Go to or find…')
    await vi.waitFor(() => expect(options()).toContain('People'))
    expect(options()).toEqual(['Home', 'Your profile', 'Notifications', ...STAFF_PAGES])
    expect(selected()?.textContent).toBe('Home')
  })

  it('offers the pages anybody may reach when it cannot tell who they are', async () => {
    const fetchMock = serve(null)
    render(<CommandPalette />)

    await opened()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(options()).toEqual(['Home', 'Your profile', 'Notifications'])
  })

  it('asks who they are once, however often it opens', async () => {
    const fetchMock = serve(STAFF)
    render(<CommandPalette />)

    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))
    await userEvent.keyboard('{Escape}')
    await opened()

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('drops who they are when it was closed before the answer came', async () => {
    let answer: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))) as never
    render(<CommandPalette />)

    await opened()
    await userEvent.keyboard('{Escape}')
    await act(async () => answer(jsonResponse(200, STAFF)))
    serve(null)
    await opened()

    expect(options()).toEqual(['Home', 'Your profile', 'Notifications'])
  })

  it.each([
    ['/', {}],
    ['k', { ctrlKey: true }],
    ['K', { metaKey: true }],
  ])('opens on %s, from anywhere but a field being typed in', async (key, modifiers) => {
    serve(null)
    render(
      <>
        <input aria-label="elsewhere" />
        <CommandPalette />
      </>
    )

    const pressed = fireEvent.keyDown(document.body, { key, ...modifiers })

    expect(pressed).toBe(false)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('leaves / to a field being typed in, and a bare k to anybody', async () => {
    serve(null)
    render(
      <>
        <input aria-label="elsewhere" />
        <textarea aria-label="notes" />
        <select aria-label="choice" />
        <div aria-label="editor" />
        <CommandPalette />
      </>
    )
    // jsdom has no isContentEditable of its own.
    Object.defineProperty(screen.getByLabelText('editor'), 'isContentEditable', { value: true })

    expect(fireEvent.keyDown(screen.getByLabelText('elsewhere'), { key: '/' })).toBe(true)
    expect(fireEvent.keyDown(screen.getByLabelText('editor'), { key: '/' })).toBe(true)
    expect(fireEvent.keyDown(screen.getByLabelText('notes'), { key: '/' })).toBe(true)
    expect(fireEvent.keyDown(screen.getByLabelText('choice'), { key: '/' })).toBe(true)
    expect(fireEvent.keyDown(document.body, { key: 'k' })).toBe(true)
    expect(fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true })).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stops listening once it is gone', () => {
    serve(null)
    const { unmount } = render(<CommandPalette />)
    unmount()

    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(true)
  })

  it('narrows the pages by what is typed, ignoring case', async () => {
    serve(STAFF)
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), '  PRO ')

    expect(options()).toEqual(['Your profile'])
  })

  it('walks the list with the arrows, wrapping at both ends, and goes where Enter says', async () => {
    serve(null)
    render(<CommandPalette />)
    await opened()

    await userEvent.keyboard('{ArrowUp}')
    expect(selected()?.textContent).toBe('Notifications')
    // The highlight is drawn as well as announced.
    const drawn = screen.getAllByRole('option').map((each) => within(each).getByRole('button').className)
    expect(drawn.map((className) => className.includes('bg-muted'))).toEqual([false, false, true])
    expect(drawn.every((className) => className.includes('px-3'))).toBe(true)
    await userEvent.keyboard('{ArrowDown}')
    expect(selected()?.textContent).toBe('Home')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(push).toHaveBeenCalledWith('/profile')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('highlights what the pointer is on, and goes where it is clicked', async () => {
    serve(null)
    render(<CommandPalette />)
    await opened()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Notifications' }))
    expect(selected()?.textContent).toBe('Notifications')
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(push).toHaveBeenCalledWith('/profile/notifications')
  })

  it('does nothing on Enter or the arrows with nothing to go to, and says nothing matched', async () => {
    serve(null)
    render(<CommandPalette />)
    await opened()

    await userEvent.type(field(), 'z{ArrowDown}{Enter}')

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByText('Nothing matches “z”.')).toBeTruthy()
  })

  it('reopens unfiltered, at the top', async () => {
    serve(null)
    render(<CommandPalette />)
    await opened()
    await userEvent.type(field(), 'pro{ArrowDown}')
    await userEvent.keyboard('{Escape}')

    fireEvent.keyDown(document.body, { key: '/' })

    expect(field()).toHaveProperty('value', '')
    expect(selected()?.textContent).toBe('Home')
  })

  it('finds records under a heading per resource, after the pages, and goes to one', async () => {
    const fetchMock = serve(STAFF, {
      '/v0/users/': [
        { id: 'u1', username: 'ada', email: 'ada@a.test' },
        { id: 'u2', username: 'adam', email: '' },
      ],
      '/v0/notifications/inbox/': [{ id: 'n1', kind: 'token_created', message: 'A token for ada.' }],
    })
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'ad')

    await vi.waitFor(() => expect(options()).toContain('Peopleadaada@a.test'))
    expect(options()).toEqual(['Peopleadaada@a.test', 'adam', 'NotificationsA token for ada.'])
    expect(screen.getAllByRole('presentation').map((heading) => heading.textContent)).toEqual([
      'People',
      'Notifications',
    ])
    expect(searched(fetchMock).map((url) => url.pathname)).toEqual(STAFF_SEARCHES)
    expect(searched(fetchMock).map((url) => url.searchParams.get('search'))).toEqual(STAFF_SEARCHES.map(() => 'ad'))

    const [first, second] = screen.getAllByRole('option')
    expect(within(first).getByText('ada@a.test').className).toContain('text-xs')
    expect(within(second).getByRole('button').childElementCount).toBe(1)

    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(push).toHaveBeenCalledWith('/staff/people/u2')
  })

  it('counts the records on from the pages, so the arrows walk both as one list', async () => {
    const consoleError = vi.spyOn(console, 'error')
    serve(STAFF, {
      '/v0/users/': [
        { id: 'u1', username: 'peter', email: '' },
        { id: 'u2', username: 'pete', email: '' },
      ],
    })
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'pe')
    await vi.waitFor(() => expect(options()).toEqual(['People', 'Peoplepeter', 'pete']))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    expect(selected()?.textContent).toBe('pete')
    expect(screen.getAllByRole('option').map((each) => each.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ])
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'peter' }))
    expect(selected()?.textContent).toBe('Peoplepeter')
    // Keyed per resource and row, so React never sees two of one key.
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('goes to a record that is clicked, and highlights what the pointer is on', async () => {
    serve(STAFF, { '/v0/users/': [{ id: 'u1', username: 'ada', email: 'ada@a.test' }] })
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))
    await userEvent.type(field(), 'ada')
    const hit = await screen.findByRole('button', { name: /ada@a\.test/ })

    fireEvent.mouseEnter(hit)
    expect(selected()?.textContent).toContain('ada@a.test')
    await userEvent.click(hit)

    expect(push).toHaveBeenCalledWith('/staff/people/u1')
  })

  it('searches nothing for one letter', async () => {
    const fetchMock = serve(STAFF)
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'a')
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(searched(fetchMock)).toEqual([])
  })

  it('asks once typing settles, not per letter', async () => {
    const fetchMock = serve(STAFF)
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'adam')
    await vi.waitFor(() => expect(searched(fetchMock)).toHaveLength(STAFF_SEARCHES.length))
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(searched(fetchMock).map((url) => url.searchParams.get('search'))).toEqual(STAFF_SEARCHES.map(() => 'adam'))
  })

  it('narrows by field:value on the resources that declare it, and asks the rest nothing', async () => {
    const fetchMock = serve(STAFF, { '/v0/users/': [{ id: 'u1', username: 'ada', email: '' }] })
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'ada is_staff:true')

    await screen.findByRole('button', { name: 'ada' })
    const [url] = searched(fetchMock)
    expect(searched(fetchMock)).toHaveLength(1)
    expect(url.pathname).toBe('/v0/users/')
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'ada', is_staff: 'true', page_size: '5' })
  })

  it('says which field nothing can be narrowed by, and what can, in order', async () => {
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
    serve({ ...STAFF, is_superuser: true })
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'colour:red')

    expect(
      await screen.findByText(
        'Nothing here can be narrowed by colour. Try approval, is_active, is_staff, is_superuser, unread.'
      )
    ).toBeTruthy()
  })

  it('says nothing matched, rather than naming a field, when a field is real somewhere', async () => {
    const fetchMock = serve(STAFF)
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(options()).toContain('People'))

    await userEvent.type(field(), 'unread:true')

    await vi.waitFor(() => expect(searched(fetchMock)).toHaveLength(1))
    expect(await screen.findByText('Nothing matches “unread:true”.')).toBeTruthy()
  })

  it('hides an answer as soon as the question changes', async () => {
    serve(
      { ...STAFF, is_staff: false },
      { '/v0/notifications/inbox/': [{ id: 'n1', kind: 'k', message: 'abc found' }] }
    )
    render(<CommandPalette />)
    await opened()
    await userEvent.type(field(), 'ab')
    expect(await screen.findByText('abc found')).toBeTruthy()

    await userEvent.type(field(), 'c')

    expect(screen.queryByText('abc found')).toBeNull()
    expect(await screen.findByText('abc found')).toBeTruthy()
  })

  it('searches nothing until it knows who is asking', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    globalThis.fetch = fetchMock as never
    render(<CommandPalette />)
    await opened()

    await userEvent.type(field(), 'ada')
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByText('Nothing matches “ada”.')).toBeTruthy()
  })

  it('keeps the newer answer when an older one lands after it', async () => {
    const answers: ((response: Response) => void)[] = []
    // Only the inbox is held, so its answers can land in either order.
    const fetchMock = vi.fn((request: Request) => {
      const { pathname } = new URL(request.url)
      if (pathname === '/v0/users/me/') return Promise.resolve(jsonResponse(200, { ...STAFF, is_staff: false }))
      if (pathname !== '/v0/notifications/inbox/') return Promise.resolve(jsonResponse(200, { results: [] }))
      return new Promise<Response>((resolve) => answers.push(resolve))
    })
    globalThis.fetch = fetchMock as never
    render(<CommandPalette />)
    await opened()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await userEvent.type(field(), 'ab')
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    await userEvent.type(field(), 'c')
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    await act(async () => answers[1](jsonResponse(200, { results: [{ id: 'n2', kind: 'k', message: 'new' }] })))
    await act(async () => answers[0](jsonResponse(200, { results: [{ id: 'n1', kind: 'k', message: 'old' }] })))

    expect(await screen.findByText('new')).toBeTruthy()
    expect(screen.queryByText('old')).toBeNull()
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
  })
})
