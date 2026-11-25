import { CommandPalette } from '@/components/app-search/CommandPalette'
import { RemoteCombobox, type RemotePage, pageOf } from '@/components/app/RemoteCombobox'

import { backend, world } from '../../support/backend'
import { freshDom } from '../../support/dom'
import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

vi.mock('@/config/public', () => ({
  CONFIG: {
    DOMAIN: 'test-project.test',
    OAUTH_PROVIDER: { MODE: 'approval' },
    SOCIAL_LOGIN: { PROVIDERS: [], ICONS: [], ADMIN_ONLY: [] },
  },
}))

const settle = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

const label = fc.stringMatching(/^[A-Za-z][a-z]{2,8}$/)
const options = fc.uniqueArray(fc.record({ value: fc.uuid(), label }), {
  selector: (option) => option.label,
  maxLength: 4,
})
const someOptions = fc.uniqueArray(fc.record({ value: fc.uuid(), label }), {
  selector: (option) => option.label,
  minLength: 1,
  maxLength: 4,
})

describe('a combobox that searches the server', () => {
  test.prop([
    fc.array(fc.record({ id: fc.nat(), name: label }), { maxLength: 4 }),
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 1, max: 5 }),
  ])('reads one page of a listing as options, with more only before the last page', (rows, page, pages) => {
    const read = pageOf({ total_pages: pages, results: rows }, page, (row) => ({
      value: String(row.id),
      label: row.name,
    }))
    expect(read).toEqual({
      options: rows.map((row) => ({ value: String(row.id), label: row.name })),
      hasMore: page < pages,
    })
    expect(pageOf(undefined, page, () => ({ value: '', label: '' }))).toEqual({ options: [], hasMore: false })
  })

  // A held value shows its label, else the value itself until a label is known.
  // Nothing found leaves only "anyone" to pick; something found picks its first.
  for (const pick of ['anyone', 'an answer'] as const)
    test.prop([
      fc.array(fc.stringMatching(/^[a-z]{1,5}$/), { minLength: 1, maxLength: 3 }),
      pick === 'anyone' ? fc.constant<RemotePage['options']>([]) : someOptions,
      fc.option(fc.uuid(), { nil: '' }),
      fc.boolean(),
    ])(
      `asks once for what was last typed, says it is searching, shows only that answer, and hands back the one picked: ${pick}`,
      async (typed, found, value, labelled) => {
        freshDom()
        // Each answer held until released, so "searching" is read while the search is out however slow the machine.
        let release = () => {}
        const out = new Promise<void>((resolve) => (release = resolve))
        const search = vi.fn(async (term: string): Promise<RemotePage> => {
          await out
          return { options: term === typed.at(-1) ? found : [{ value: 'stale', label: 'Stale' }], hasMore: false }
        })
        const picked = vi.fn()
        render(
          <RemoteCombobox
            label="Owner"
            value={value}
            valueLabel={value && labelled ? 'Chosen' : undefined}
            anyLabel="Anyone"
            placeholder="Search"
            searchingLabel="Searching"
            emptyLabel="Nobody"
            moreLabel="More"
            search={search}
            onPick={picked}
            more="button"
          />
        )
        const field = screen.getByRole('combobox') as HTMLInputElement
        const held = labelled ? 'Chosen' : value
        expect(field.value).toBe(value ? held : 'Anyone')
        fireEvent.focus(field)
        for (const term of typed) fireEvent.change(field, { target: { value: term } })
        expect(await screen.findByText('Searching')).toBeTruthy()
        release()
        await vi.waitFor(() => expect(screen.queryByText('Searching')).toBeNull())

        expect(search.mock.calls.map(([term]) => term)).toEqual([typed.at(-1)])
        expect(screen.queryByText('Stale')).toBeNull()
        if (found.length === 0) expect(screen.getByText('Nobody')).toBeTruthy()
        const choices = screen.getAllByRole('option')
        expect(choices.map((choice) => choice.textContent)).toEqual(['Anyone', ...found.map((option) => option.label)])
        const index = pick === 'an answer' ? 1 : 0
        fireEvent.mouseDown(choices[index])
        fireEvent.click(choices[index])
        expect(picked).toHaveBeenCalledWith(index ? found[0].value : '')
        expect(screen.queryByRole('listbox')).toBeNull()
      }
    )

  test.prop([
    fc.array(options, { minLength: 1, maxLength: 3 }),
    fc.constantFrom('observer' as const, 'button' as const),
  ])('adds each further page after the last, until the server says there is no more', async (pages, more) => {
    freshDom()
    const observed: ((entries: { isIntersecting: boolean }[]) => void)[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      more === 'observer'
        ? class {
            constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
              observed.push(callback)
            }
            observe() {}
            disconnect() {}
          }
        : undefined
    )
    const search = vi.fn(async (_term: string, page: number): Promise<RemotePage> => ({
      options: pages[page - 1],
      hasMore: page < pages.length,
    }))
    render(
      <RemoteCombobox
        label="Owner"
        value=""
        anyLabel="Anyone"
        placeholder="Search"
        searchingLabel="Searching"
        emptyLabel="Nobody"
        moreLabel="More"
        search={search}
        onPick={vi.fn()}
        more={more}
      />
    )
    fireEvent.focus(screen.getByRole('combobox'))
    await settle(300)
    for (let page = 2; page <= pages.length; page++) {
      if (more === 'button') {
        fireEvent.mouseDown(screen.getByRole('button', { name: 'More' }))
        fireEvent.click(screen.getByRole('button', { name: 'More' }))
      }
      // Seen twice before the page comes back, as an observer can: still one request for it.
      else
        await act(async () => {
          observed.at(-1)?.([{ isIntersecting: true }])
          observed.at(-1)?.([{ isIntersecting: true }])
        })
      await settle(5)
    }
    expect(search.mock.calls.map(([, page]) => page)).toEqual(pages.map((_, index) => index + 1))
    expect(
      screen
        .getAllByRole('option')
        .slice(1)
        .map((option) => option.textContent)
    ).toEqual(pages.flat().map((option) => option.label))
    expect(screen.queryByText('More')).toBeNull()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    vi.unstubAllGlobals()
  })

  test('treats a search that failed as one that found nothing, and closes once the field is left', async () => {
    freshDom()
    render(
      <RemoteCombobox
        label="Owner"
        value=""
        anyLabel="Anyone"
        placeholder="Search"
        searchingLabel="Searching"
        emptyLabel="Nobody"
        moreLabel="More"
        search={async () => {
          throw new Error('down')
        }}
        onPick={vi.fn()}
      />
    )
    fireEvent.focus(screen.getByRole('combobox'))
    await settle(300)
    expect(screen.getByText('Nobody')).toBeTruthy()
    fireEvent.blur(screen.getByRole('combobox'))
    await settle(200)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('the command palette', () => {
  function openWith(how: 'button' | 'slash' | 'chord') {
    if (how === 'button') fireEvent.click(screen.getByRole('button', { name: /search/i }))
    else if (how === 'slash') fireEvent.keyDown(document.body, { key: '/' })
    else fireEvent.keyDown(document.body, { key: 'K', ctrlKey: true })
  }

  test.prop([fc.constantFrom('button' as const, 'slash' as const, 'chord' as const)])(
    'opens from its button, from / and from Ctrl+K',
    async (how) => {
      freshDom()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 503 }))
      )
      render(<CommandPalette />)
      openWith(how)
      expect(await screen.findByRole('dialog')).toBeTruthy()
    }
  )

  test.prop([fc.constantFrom('INPUT', 'TEXTAREA', 'SELECT', 'editable')])(
    'takes / as a character while somebody is typing',
    (where) => {
      freshDom()
      render(<CommandPalette />)
      const target = where === 'editable' ? document.createElement('div') : document.createElement(where.toLowerCase())
      // jsdom has no contentEditable; a browser reports it on the element itself.
      if (where === 'editable') Object.defineProperty(target, 'isContentEditable', { value: true })
      document.body.appendChild(target)
      fireEvent.keyDown(target, { key: '/' })
      expect(screen.queryByRole('dialog')).toBeNull()
      target.remove()
    }
  )

  // Every read answering: this is about what is searched, not about a read that failed.
  test.prop([
    world.map((w) => ({ ...w, down: [] })),
    fc.stringMatching(/^[a-z]{2,5}$/),
    fc.array(fc.constantFrom('ArrowDown', 'ArrowUp'), { maxLength: 6 }),
  ])(
    'walks every place and hit with the arrows, wrapping at either end, and goes where Enter lands',
    async (w, needle, keys) => {
      freshDom()
      navigation.push.mockClear()
      vi.stubGlobal(
        'fetch',
        backend({ ...w, me: { ...w.me, is_staff: true, is_superuser: true } }, 'superuser', 'everything')
      )
      render(<CommandPalette />)
      openWith('button')
      await settle(20)
      const field = screen.getByRole('searchbox')
      fireEvent.change(field, { target: { value: needle } })
      await settle(260)

      const listed = screen.queryAllByRole('option')
      let at = 0
      for (const key of keys) {
        fireEvent.keyDown(field, { key })
        at = listed.length ? (at + (key === 'ArrowDown' ? 1 : -1) + listed.length) % listed.length : 0
      }
      if (listed.length === 0) {
        // Said in the empty state; the needle may also sit inside a place's name.
        expect(screen.getAllByText(new RegExp(needle)).length).toBeGreaterThan(0)
        fireEvent.keyDown(field, { key: 'Enter' })
        expect(navigation.push).not.toHaveBeenCalled()
        return
      }
      expect(screen.getAllByRole('option')[at].getAttribute('aria-selected')).toBe('true')
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(navigation.push).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  )

  test.prop([world.map((w) => ({ ...w, down: [] }))])(
    'goes where a place or a hit is clicked, and says which fields exist when one typed is unknown',
    async (w) => {
      freshDom()
      navigation.push.mockClear()
      vi.stubGlobal(
        'fetch',
        backend({ ...w, me: { ...w.me, is_staff: true, is_superuser: true } }, 'superuser', 'everything')
      )
      render(<CommandPalette />)
      openWith('button')
      await settle(20)
      const field = screen.getByRole('searchbox')
      fireEvent.change(field, { target: { value: 'zzunknown:x' } })
      await settle(260)
      expect(screen.queryAllByRole('option')).toHaveLength(0)
      expect(screen.getByText(/zzunknown/)).toBeTruthy()
      // With nothing listed the arrows walk nowhere, and Enter goes nowhere.
      fireEvent.keyDown(field, { key: 'ArrowDown' })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(navigation.push).not.toHaveBeenCalled()

      fireEvent.change(field, { target: { value: '' } })
      const first = screen.getAllByRole('option')[0].querySelector('button') as HTMLButtonElement
      fireEvent.mouseEnter(first)
      fireEvent.click(first)
      expect(navigation.push).toHaveBeenCalledWith('/')
    }
  )

  // No endpoints, so the notices are the last group listed.
  test.prop([
    world.map((w) => ({ ...w, endpoints: [], down: [] })).filter((w) => w.inbox.length > 0),
    fc.stringMatching(/^[a-z]{2,4}$/),
  ])('goes where a hit is clicked, and drops an answer to a search somebody typed past', async (w, needle) => {
    freshDom()
    navigation.push.mockClear()
    const served = backend(w, 'member', 'everything')
    // Each search answered late, so the next one can be typed while the last is still out.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return served(input)
      })
    )
    render(<CommandPalette />)
    openWith('button')
    await settle(150)
    const field = screen.getByRole('searchbox')
    // Past the 250ms pause, so the first search is out, and inside its 100ms answer, so it is still out.
    fireEvent.change(field, { target: { value: `${needle}x` } })
    await settle(300)
    fireEvent.change(field, { target: { value: needle } })
    await settle(500)
    // Hits come after the places, and this person's notices are always searched, so the last option is one.
    const button = screen.getAllByRole('option').at(-1)?.querySelector('button') as HTMLButtonElement
    fireEvent.mouseEnter(button)
    expect(button.closest('li')?.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(button)
    expect(navigation.push).toHaveBeenCalledTimes(1)
    expect(navigation.push.mock.calls[0][0]).toMatch(/^\/profile\/notifications/)
  })
})
