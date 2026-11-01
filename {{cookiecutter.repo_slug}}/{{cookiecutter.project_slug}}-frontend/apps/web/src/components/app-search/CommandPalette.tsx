'use client'

import { useRouter } from 'next/navigation'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'

import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/base/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/base/dialog'
import { Input } from '@/components/base/input'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { type SearchHit, askedOf, destinationsFor, searchableResources } from '@/lib/searchableResources'
import { cn } from '@/lib/utils'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

// Where `/` is a character being typed rather than the shortcut.
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

// Long enough that typing a word is one fan-out rather than five.
const SETTLES_AFTER = 200

type Found = SearchHit & { group: string; groupLabel: string }

// Keyed by the question it answers, so a stale answer is never shown for a newer one.
type Answer = { query: string; hits: Found[]; refused?: { field: string; declared: string[] } }

/** Go anywhere, or find a record, by typing: `/` or Ctrl/Cmd+K opens it. */
export function CommandPalette() {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // Asked on first opening rather than on every page: it decides what may be offered and searched.
  const [me, setMe] = useState<ApiType<'User'>>()
  const [answered, setAnswered] = useState<Answer>()

  const needle = query.trim()
  const answer = answered?.query === needle ? answered : undefined
  const found = answer?.hits ?? []
  const refused = answer?.refused

  const matches = useMemo(
    () => destinationsFor(me, t).filter((each) => each.label.toLowerCase().includes(needle.toLowerCase())),
    [me, t, needle]
  )
  // One sequence, so Enter and the arrows mean the same whichever kind is highlighted.
  const walkable = [...matches, ...found]

  useEffect(() => {
    if (!open || me) return
    let live = true
    createApi(apiOrigin())
      .me()
      .then(({ data }) => {
        if (live && data) setMe(data)
      })
    return () => {
      live = false
    }
  }, [open, me])

  useEffect(() => {
    // Closing empties the query, so a closed palette never gets this far.
    if (!me || needle.length < 2) return
    let live = true
    const timer = setTimeout(async () => {
      const asked = askedOf(searchableResources(me, t), needle)
      const groups = await Promise.all(
        asked.map(async ({ resource, query: narrowed }) =>
          narrowed
            ? (await resource.search(narrowed)).map((hit) => ({
                ...hit,
                group: resource.key,
                groupLabel: resource.label,
              }))
            : []
        )
      )
      if (!live) return
      // Said once, and only when no resource could be asked at all: the field may be real on another.
      const refusals = asked.flatMap(({ problem }) => (problem ? [problem] : []))
      const refused =
        refusals.length === asked.length
          ? { field: refusals[0].field, declared: [...new Set(refusals.flatMap(({ declared }) => declared))].sort() }
          : undefined
      setAnswered({ query: needle, hits: groups.flat(), refused })
    }, SETTLES_AFTER)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [me, needle, t])

  // The one way in and out, so every entry point opens it unfiltered.
  const show = useCallback((next: boolean) => {
    setOpen(next)
    setQuery('')
    setActive(0)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const slash = event.key === '/' && !isTyping(event.target)
      const chord = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
      if (slash || chord) {
        event.preventDefault()
        show(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [show])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onInputKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      // Wraps, so neither end is a dead end.
      setActive((at) => (walkable.length ? (at + step + walkable.length) % walkable.length : 0))
    } else if (event.key === 'Enter' && walkable[active]) {
      event.preventDefault()
      go(walkable[active].href)
    }
  }

  const option = (index: number) =>
    cn('flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm', index === active && 'bg-muted')

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={t('auth:paletteOpen')} onClick={() => show(true)}>
        <SearchIcon className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent className="top-24 max-w-lg translate-y-0 gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">{t('auth:paletteTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('auth:paletteDescription')}</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onInputKeyDown}
              placeholder={t('auth:palettePlaceholder')}
              // Its own name: a listing's filter on the page is a search box too.
              aria-label={t('auth:paletteField')}
              aria-controls="command-palette-results"
              className="h-11 border-0 bg-transparent p-0 focus-visible:ring-0"
            />
          </div>
          {walkable.length ? (
            <ul id="command-palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1">
              {matches.map((destination, index) => (
                <li key={destination.href} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    // Pointer rather than focus: focus stays in the input, so typing keeps working.
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(destination.href)}
                    className={option(index)}
                  >
                    {destination.label}
                  </button>
                </li>
              ))}
              {found.map((hit, offset) => {
                const index = matches.length + offset
                const opensAGroup = offset === 0 || found[offset - 1].group !== hit.group
                return (
                  <li key={`${hit.group}:${hit.id}`} role="option" aria-selected={index === active}>
                    {opensAGroup && (
                      <p role="presentation" className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
                        {hit.groupLabel}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(hit.href)}
                      className={option(index)}
                    >
                      <span className="w-full truncate">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="w-full truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {/* Named rather than silently empty, so a mistyped field does not read as "no matches". */}
              {refused
                ? t('auth:paletteUnknownField', { field: refused.field, fields: refused.declared.join(', ') })
                : t('auth:paletteNoResults', { query: needle })}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
