'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { cn } from '@/lib/utils'

export type RemoteOption = { value: string; label: string }

/** One page of an answer. `hasMore` is the endpoint's own word for it rather than a guess from the
 *  page's length, which is wrong on a last page that lands exactly full. */
export type RemotePage = { options: RemoteOption[]; hasMore: boolean }

export type RemoteComboboxProps = {
  label: string
  // The chosen id, and what to call it - resolved by whoever renders this, because a chosen value has
  // to read as a name before anybody types anything.
  value: string
  valueLabel?: string
  // Shown when nothing is chosen, and the option that clears it.
  anyLabel: string
  placeholder: string
  searchingLabel: string
  emptyLabel: string
  /** What the reader presses, or what the observer announces while it fetches. */
  moreLabel: string
  search: (term: string, page: number) => Promise<RemotePage>
  onPick: (value: string) => void
  // Reaching the end of a list is already the gesture that means "more"; a button is for a costly
  // search, or a list somebody is meant to narrow rather than walk.
  more?: 'observer' | 'button'
  className?: string
}

const FIRST_PAGE = 1
const DEBOUNCE_MS = 250
const NOTHING: RemotePage = { options: [], hasMore: false }

/** The listing envelope every paginated endpoint answers with, as a page of options. Read off
 *  `total_pages`: a page that lands exactly full is indistinguishable from the last one by length. */
export function pageOf<Row>(
  data: { total_pages: number; results: Row[] } | undefined,
  page: number,
  option: (row: Row) => RemoteOption
): RemotePage {
  return data ? { options: data.results.map(option), hasMore: page < data.total_pages } : NOTHING
}

// Asks the server as you type rather than fetching a directory: one request per search instead of a
// page of rows per render, and it reaches rows the first page never had.
export function RemoteCombobox({
  label,
  value,
  valueLabel,
  anyLabel,
  placeholder,
  searchingLabel,
  emptyLabel,
  moreLabel,
  search,
  onPick,
  more = 'observer',
  className,
}: RemoteComboboxProps) {
  const id = useId()
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState<RemoteOption[]>([])
  // Whether a search has landed at all - otherwise an empty list on open would say "nothing matched"
  // before anything was asked.
  const [answered, setAnswered] = useState(false)
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(FIRST_PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const fetching = useRef(false)
  // Which search is current: a slower earlier answer must not overwrite a later one, and a page asked
  // for under the previous term must not be appended to this one's.
  const latest = useRef(0)

  useEffect(() => {
    if (!open) {
      return
    }
    latest.current += 1
    const mine = latest.current
    // The searching flag is set inside the timer, not beside it: in the effect it would cascade a
    // render per keystroke and flash for terms that never reach the server.
    const timer = setTimeout(async () => {
      setSearching(true)
      const found = await search(term, FIRST_PAGE).catch(() => NOTHING)
      if (mine === latest.current) {
        setOptions(found.options)
        setHasMore(found.hasMore)
        setPage(FIRST_PAGE)
        setSearching(false)
        setAnswered(true)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, open, search])

  const loadMore = useCallback(async () => {
    // A ref, not state: an observer fires again while the sentinel is still on screen, before React
    // commits, so a state flag still reads false in that call and the same page is asked for twice.
    // Nothing else to guard: the sentinel and the button only exist while there is more to fetch.
    if (fetching.current) {
      return
    }
    const mine = latest.current
    fetching.current = true
    setLoadingMore(true)
    const next = await search(term, page + 1).catch(() => NOTHING)
    if (mine === latest.current) {
      setOptions((held) => [...held, ...next.options])
      setHasMore(next.hasMore)
      setPage(page + 1)
    }
    fetching.current = false
    setLoadingMore(false)
  }, [search, term, page])

  const sentinel = useRef<HTMLLIElement | null>(null)
  // Absent outside a browser and in jsdom; the watcher then degrades to the button, not to nothing.
  const watching = more === 'observer' && typeof IntersectionObserver !== 'undefined'
  useEffect(() => {
    const watched = sentinel.current
    if (!watching || !watched) {
      return
    }
    const watcher = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), {
      // Against the list rather than the viewport: the list is what scrolls.
      root: watched.parentElement,
    })
    watcher.observe(watched)
    return () => watcher.disconnect()
  }, [watching, loadMore, options])

  function choose(picked: string) {
    setOpen(false)
    setTerm('')
    onPick(picked)
  }

  const chosen = value ? (valueLabel ?? value) : anyLabel
  const optionLook = 'w-full px-3 py-2 text-left text-sm hover:bg-muted'
  const noteLook = 'px-3 py-2 text-sm text-muted-foreground'

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          autoComplete="off"
          placeholder={placeholder}
          value={open ? term : chosen}
          onFocus={() => setOpen(true)}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          // Late enough for a click on an option to land first.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-background shadow-sm"
          >
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose('')}
                className={optionLook}
              >
                {anyLabel}
              </button>
            </li>
            {searching && <li className={noteLook}>{searchingLabel}</li>}
            {!searching && answered && options.length === 0 && <li className={noteLook}>{emptyLabel}</li>}
            {!searching &&
              options.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option.value)}
                    className={optionLook}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            {!searching && hasMore && (
              <li ref={sentinel} className={noteLook}>
                {watching ? (
                  moreLabel
                ) : (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="hover:underline disabled:opacity-50"
                  >
                    {moreLabel}
                  </button>
                )}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
