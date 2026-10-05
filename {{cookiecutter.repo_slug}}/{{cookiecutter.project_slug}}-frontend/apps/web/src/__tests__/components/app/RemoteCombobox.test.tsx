import { RemoteCombobox, pageOf } from '@/components/app/RemoteCombobox'
import type { RemoteComboboxProps, RemotePage } from '@/components/app/RemoteCombobox'

import { test } from '@fast-check/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LABELS = {
  label: 'Owner',
  anyLabel: 'Anyone',
  placeholder: 'Search people',
  searchingLabel: 'Searching…',
  emptyLabel: 'Nobody matches',
  moreLabel: 'More people',
}

const page = (labels: string[], hasMore = false): RemotePage => ({
  options: labels.map((label) => ({ value: label.toLowerCase(), label })),
  hasMore,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function renderBox(props: Partial<RemoteComboboxProps> = {}) {
  const search = props.search ?? vi.fn(async () => page(['Ada', 'Grace']))
  const onPick = props.onPick ?? vi.fn()
  render(<RemoteCombobox {...LABELS} value="" more="button" {...props} search={search} onPick={onPick} />)
  return { search, onPick, input: screen.getByRole('combobox') as HTMLInputElement }
}

async function settle(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const listed = () => screen.getAllByRole('option').map((option) => option.textContent)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RemoteCombobox', () => {
  it('reads as the any label when nothing is chosen, labelled by its label', () => {
    const { input } = renderBox()

    expect(input.value).toBe('Anyone')
    expect(screen.getByLabelText('Owner')).toBe(input)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.placeholder).toBe('Search people')
    expect(input.getAttribute('autocomplete')).toBe('off')
  })

  it("reads as the chosen value's label, or the bare value when the caller resolved none", () => {
    renderBox({ value: 'ada', valueLabel: 'Ada Lovelace' })
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Ada Lovelace')
    cleanup()

    renderBox({ value: 'ada' })
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('ada')
  })

  it('opens a listbox it controls on focus, and searches the empty term once the debounce passes', async () => {
    const { input, search } = renderBox()

    fireEvent.focus(input)

    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.value).toBe('')
    const listbox = screen.getByRole('listbox')
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    // Nothing yet but the way to clear: no rows, no "searching", no "more" before anything was asked.
    expect(listed()).toEqual(['Anyone'])
    expect(screen.queryByText('Searching…')).toBeNull()
    expect(screen.queryByText('More people')).toBeNull()
    await settle(249)
    expect(search).not.toHaveBeenCalled()
    await settle(1)
    expect(search).toHaveBeenCalledExactlyOnceWith('', 1)
    expect(screen.getByRole('option', { name: 'Ada' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Grace' })).toBeTruthy()
    expect(screen.queryByText('Nobody matches')).toBeNull()
  })

  it('styles its options as rows and its notes as quieter text', async () => {
    const { input } = renderBox({ search: async () => page([]) })
    fireEvent.focus(input)
    await settle()

    expect(screen.getByRole('option', { name: 'Anyone' }).classList.contains('hover:bg-muted')).toBe(true)
    expect(screen.getByText('Nobody matches').classList.contains('text-muted-foreground')).toBe(true)
  })

  it('does not search while closed', async () => {
    const { search } = renderBox()

    await settle(1000)

    expect(search).not.toHaveBeenCalled()
  })

  it('asks once per pause in typing, for the last term typed', async () => {
    const { input, search } = renderBox()
    fireEvent.focus(input)

    fireEvent.change(input, { target: { value: 'a' } })
    await settle(100)
    fireEvent.change(input, { target: { value: 'ad' } })
    await settle(250)

    expect(search).toHaveBeenCalledExactlyOnceWith('ad', 1)
  })

  it('says it is searching while an answer is outstanding, and nothing about emptiness before one lands', async () => {
    const answer = deferred<RemotePage>()
    const { input } = renderBox({ search: () => answer.promise })
    fireEvent.focus(input)

    expect(screen.queryByText('Nobody matches')).toBeNull()
    await settle()
    expect(screen.getByText('Searching…')).toBeTruthy()
    expect(screen.queryByText('Nobody matches')).toBeNull()

    await act(async () => answer.resolve(page([])))

    expect(screen.queryByText('Searching…')).toBeNull()
    expect(screen.getByText('Nobody matches')).toBeTruthy()
  })

  it('reads a failed search as nothing found', async () => {
    const { input } = renderBox({ search: async () => Promise.reject(new Error('down')) })
    fireEvent.focus(input)

    await settle()

    expect(screen.getByText('Nobody matches')).toBeTruthy()
  })

  it('keeps the later answer when an earlier, slower one lands after it', async () => {
    const answers: Record<string, ReturnType<typeof deferred<RemotePage>>> = {
      a: deferred<RemotePage>(),
      ab: deferred<RemotePage>(),
    }
    const { input } = renderBox({ search: (term) => answers[term].promise })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'a' } })
    await settle()
    fireEvent.change(input, { target: { value: 'ab' } })
    await settle()

    await act(async () => answers.ab.resolve(page(['Abby'])))
    await act(async () => answers.a.resolve(page(['Ada'])))

    expect(screen.getByRole('option', { name: 'Abby' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Ada' })).toBeNull()
  })

  it('hands the pick to the caller, closes, and forgets the term', async () => {
    const { input, onPick } = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'gr' } })
    await settle()

    fireEvent.click(screen.getByRole('option', { name: 'Grace' }))

    expect(onPick).toHaveBeenCalledExactlyOnceWith('grace')
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.focus(input)
    expect(input.value).toBe('')
  })

  it('offers the any option to clear the choice', async () => {
    const { input, onPick } = renderBox({ value: 'ada', valueLabel: 'Ada' })
    fireEvent.focus(input)

    fireEvent.click(screen.getByRole('option', { name: 'Anyone' }))

    expect(onPick).toHaveBeenCalledExactlyOnceWith('')
  })

  it('marks which option is chosen', async () => {
    const { input } = renderBox({ value: 'grace', valueLabel: 'Grace' })
    fireEvent.focus(input)
    await settle()

    expect(screen.getByRole('option', { name: 'Grace' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Ada' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('option', { name: 'Anyone' }).getAttribute('aria-selected')).toBe('false')
  })

  it('marks the any option chosen when nothing is', async () => {
    const { input } = renderBox()
    fireEvent.focus(input)

    expect(screen.getByRole('option', { name: 'Anyone' }).getAttribute('aria-selected')).toBe('true')
  })

  it('keeps focus in the input when an option is pressed, so the click lands before the blur', async () => {
    const { input } = renderBox()
    fireEvent.focus(input)
    await settle()

    expect(fireEvent.mouseDown(screen.getByRole('option', { name: 'Anyone' }))).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('option', { name: 'Ada' }))).toBe(false)
  })

  it('closes on Escape and on no other key', () => {
    const { input } = renderBox()
    fireEvent.focus(input)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes a moment after losing focus, not at once', async () => {
    const { input } = renderBox()
    fireEvent.focus(input)

    fireEvent.blur(input)
    await settle(149)
    expect(screen.getByRole('listbox')).toBeTruthy()
    await settle(1)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('applies the caller class to its outer shell', () => {
    const { container } = render(
      <RemoteCombobox {...LABELS} value="" search={vi.fn()} onPick={vi.fn()} className="w-56" />
    )

    expect(container.firstElementChild?.className).toContain('w-56')
    expect(container.firstElementChild?.className).toContain('flex')
  })

  it('falls back to the button where there is no IntersectionObserver to watch with', async () => {
    const { input } = renderBox({ more: 'observer', search: async () => page(['Ada'], true) })
    fireEvent.focus(input)
    await settle()

    expect(screen.getByRole('button', { name: 'More people' })).toBeTruthy()
  })

  describe('with a button for more', () => {
    it('appends the next page for the same term when pressed, until there is no more', async () => {
      const search = vi.fn(async (_term: string, at: number) => (at === 1 ? page(['Ada'], true) : page(['Grace'])))
      const { input } = renderBox({ search })
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'x' } })
      await settle()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'More people' }))
      })

      expect(search).toHaveBeenLastCalledWith('x', 2)
      expect(listed()).toEqual(['Anyone', 'Ada', 'Grace'])
      expect(screen.queryByRole('button', { name: 'More people' })).toBeNull()
    })

    it('keeps the more control in the list without moving focus', async () => {
      const { input } = renderBox({ search: async () => page(['Ada'], true) })
      fireEvent.focus(input)
      await settle()

      expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'More people' }))).toBe(false)
    })

    it('is disabled until the page it asked for lands', async () => {
      const second = deferred<RemotePage>()
      const search = vi.fn((_term: string, at: number) =>
        at === 1 ? Promise.resolve(page(['Ada'], true)) : second.promise
      )
      const { input } = renderBox({ search })
      fireEvent.focus(input)
      await settle()
      const more = screen.getByRole('button', { name: 'More people' }) as HTMLButtonElement

      fireEvent.click(more)

      expect(more.disabled).toBe(true)
      await act(async () => second.resolve(page(['Grace'], true)))
      expect(more.disabled).toBe(false)
      await act(async () => {
        fireEvent.click(more)
      })
      expect(search).toHaveBeenLastCalledWith('', 3)
    })

    it('drops a page asked for under a term that has since changed', async () => {
      const second = deferred<RemotePage>()
      const search = vi.fn((term: string, at: number) => {
        if (at === 2) return second.promise
        return Promise.resolve(term === 'a' ? page(['Ada'], true) : page(['Bea']))
      })
      const { input } = renderBox({ search })
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'a' } })
      await settle()
      fireEvent.click(screen.getByRole('button', { name: 'More people' }))
      fireEvent.change(input, { target: { value: 'b' } })
      await settle()

      await act(async () => second.resolve(page(['Alan'])))

      expect(listed()).toEqual(['Anyone', 'Bea'])
    })

    it('reads a failed page as the end of the list', async () => {
      const search = vi.fn((_term: string, at: number) =>
        at === 1 ? Promise.resolve(page(['Ada'], true)) : Promise.reject(new Error('down'))
      )
      const { input } = renderBox({ search })
      fireEvent.focus(input)
      await settle()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'More people' }))
      })

      expect(listed()).toEqual(['Anyone', 'Ada'])
      expect(screen.queryByRole('button', { name: 'More people' })).toBeNull()
    })

    it('starts again from the first page for a new term', async () => {
      const search = vi.fn(async () => page(['Ada'], true))
      const { input } = renderBox({ search })
      fireEvent.focus(input)
      await settle()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'More people' }))
      })

      fireEvent.change(input, { target: { value: 'z' } })
      await settle()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'More people' }))
      })

      expect(search).toHaveBeenLastCalledWith('z', 2)
    })
  })

  describe('watching the end of the list', () => {
    type Watcher = {
      callback: IntersectionObserverCallback
      root: Element | null
      disconnect: ReturnType<typeof vi.fn>
    }
    let watchers: Watcher[]

    beforeEach(() => {
      watchers = []
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          disconnect = vi.fn()
          constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
            watchers.push({ callback, root: options.root as Element | null, disconnect: this.disconnect })
          }
          observe() {}
        }
      )
    })

    const sight = (watcher: Watcher, ...seen: boolean[]) =>
      watcher.callback(
        seen.map((isIntersecting) => ({ isIntersecting }) as IntersectionObserverEntry),
        {} as IntersectionObserver
      )

    it('announces more rather than offering a button, watched against the list itself', async () => {
      const { input } = renderBox({ more: 'observer', search: async () => page(['Ada'], true) })
      fireEvent.focus(input)
      await settle()

      expect(screen.getByText('More people').tagName).toBe('LI')
      expect(screen.queryByRole('button', { name: 'More people' })).toBeNull()
      expect(watchers.at(-1)?.root).toBe(screen.getByRole('listbox'))
    })

    it('watches by default', async () => {
      render(<RemoteCombobox {...LABELS} value="" search={async () => page(['Ada'], true)} onPick={vi.fn()} />)
      fireEvent.focus(screen.getByRole('combobox'))
      await settle()

      expect(screen.queryByRole('button', { name: 'More people' })).toBeNull()
      expect(watchers).toHaveLength(1)
    })

    it('fetches the next page once the end comes into view, and not before', async () => {
      const search = vi.fn(async (_term: string, at: number) => (at === 1 ? page(['Ada'], true) : page(['Grace'])))
      const { input } = renderBox({ more: 'observer', search })
      fireEvent.focus(input)
      await settle()

      await act(async () => sight(watchers.at(-1)!, false))
      expect(search).toHaveBeenCalledTimes(1)
      await act(async () => sight(watchers.at(-1)!, true))

      expect(search).toHaveBeenLastCalledWith('', 2)
      expect(screen.getByRole('option', { name: 'Grace' })).toBeTruthy()
    })

    it('fetches when any one of several sightings is of the end', async () => {
      const search = vi.fn(async (_term: string, at: number) => (at === 1 ? page(['Ada'], true) : page(['Grace'])))
      const { input } = renderBox({ more: 'observer', search })
      fireEvent.focus(input)
      await settle()

      await act(async () => sight(watchers.at(-1)!, false, true))

      expect(search).toHaveBeenLastCalledWith('', 2)
    })

    it('asks for the next page once when the end is sighted twice before anything commits', async () => {
      const next = deferred<RemotePage>()
      const search = vi.fn((_term: string, at: number) =>
        at === 1 ? Promise.resolve(page(['Ada'], true)) : next.promise
      )
      const { input } = renderBox({ more: 'observer', search })
      fireEvent.focus(input)
      await settle()
      const watcher = watchers.at(-1)!

      await act(async () => {
        sight(watcher, true)
        sight(watcher, true)
      })
      await act(async () => next.resolve(page(['Grace'])))

      expect(search.mock.calls.filter(([, at]) => at === 2)).toHaveLength(1)
    })

    it('stops watching when the list changes', async () => {
      const { input } = renderBox({ more: 'observer', search: async () => page(['Ada'], true) })
      fireEvent.focus(input)
      await settle()
      const first = watchers.at(-1)!

      fireEvent.change(input, { target: { value: 'q' } })
      await settle()

      expect(first.disconnect).toHaveBeenCalled()
    })

    it('watches nothing when there is no more to fetch', async () => {
      const { input } = renderBox({ more: 'observer', search: async () => page(['Ada']) })
      fireEvent.focus(input)
      await settle()

      expect(watchers).toHaveLength(0)
    })

    it('still offers the button when asked for one', async () => {
      const { input } = renderBox({ more: 'button', search: async () => page(['Ada'], true) })
      fireEvent.focus(input)
      await settle()

      expect(screen.getByRole('button', { name: 'More people' })).toBeTruthy()
      expect(watchers).toHaveLength(0)
    })
  })

  // Answers can arrive in any order; whichever order, the list shows the answer to what was last
  // typed, never to a term the reader has moved past.
  test.prop([fc.uniqueArray(fc.stringMatching(/^[a-z]{1,4}$/), { minLength: 2, maxLength: 4 }), fc.nat()], {
    numRuns: 25,
  })('shows the answer to the last term typed, whatever order the answers land in', async (terms, seed) => {
    const answers = new Map(terms.map((term) => [term, deferred<RemotePage>()]))
    const { input } = renderBox({ search: (term) => answers.get(term)!.promise })
    fireEvent.focus(input)
    for (const term of terms) {
      fireEvent.change(input, { target: { value: term } })
      await settle()
    }

    const order = [...terms].sort((a, b) => ((a.charCodeAt(0) * 31 + seed) % 7) - ((b.charCodeAt(0) * 31 + seed) % 7))
    for (const term of order) {
      await act(async () => answers.get(term)!.resolve(page([`Result ${term}`])))
    }

    expect(listed()).toEqual(['Anyone', `Result ${terms.at(-1)}`])
    cleanup()
  })
})

describe('pageOf', () => {
  const named = (name: string) => ({ value: name, label: name.toUpperCase() })

  it('maps the rows, with more to come only before the last page', () => {
    expect(pageOf({ total_pages: 3, results: ['a'] }, 2, named)).toEqual({
      options: [{ value: 'a', label: 'A' }],
      hasMore: true,
    })
    expect(pageOf({ total_pages: 3, results: [] }, 3, named).hasMore).toBe(false)
    expect(pageOf({ total_pages: 3, results: [] }, 4, named).hasMore).toBe(false)
  })

  it('reads an answer that never came as an empty last page', () => {
    expect(pageOf(undefined, 1, named)).toEqual({ options: [], hasMore: false })
  })

  test.prop([fc.array(fc.string(), { maxLength: 5 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 9 })])(
    "maps every row and has more exactly while the page is before the listing's last",
    (names, at, totalPages) => {
      const result = pageOf({ total_pages: totalPages, results: names }, at, (name) => ({ value: name, label: name }))

      expect(result.options).toEqual(names.map((name) => ({ value: name, label: name })))
      expect(result.hasMore).toBe(at < totalPages)
    }
  )
})
