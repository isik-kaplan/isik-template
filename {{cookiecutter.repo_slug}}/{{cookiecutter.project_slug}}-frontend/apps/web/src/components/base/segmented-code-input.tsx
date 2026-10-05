'use client'

import { useId, useRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * A code typed one digit per box, grouped the way it is read: `groups="3-3"` is 123-456, `"4-4"` a
 * backup code, `"6"` one unbroken run. The boxes say how long the code is before anything is typed.
 *
 * Not for a field that also accepts something else - a recovery code has neither this length nor
 * this shape, so it gets a plain input.
 */
export type SegmentedCodeInputProps = {
  value: string
  onChange: (value: string) => void
  /** Boxes per group, separated by dashes. */
  groups: string
  /** Names the whole control; `digitLabel` names each box, since a screen reader lands on one box. */
  label: string
  digitLabel: (position: number, total: number) => string
  name?: string
  autoFocus?: boolean
  disabled?: boolean
  className?: string
}

const DIGIT = /^\d$/

export function SegmentedCodeInput({
  value,
  onChange,
  groups,
  label,
  digitLabel,
  name,
  autoFocus,
  disabled,
  className,
}: SegmentedCodeInputProps) {
  const sizes = groups.split('-').map(Number)
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const id = useId()

  function focusBox(index: number) {
    boxes.current[Math.min(Math.max(index, 0), total - 1)]?.focus()
  }

  // Held as a fixed-length string, so clearing a box in the middle leaves a hole rather than pulling
  // the rest of the code left under the cursor.
  function write(at: number, characters: string) {
    const held = value.padEnd(total, ' ').slice(0, total).split('')
    const typed = characters.split('').filter((character) => DIGIT.test(character))
    if (typed.length === 0 && characters !== '') return
    typed.forEach((character, offset) => {
      if (at + offset < total) held[at + offset] = character
    })
    if (characters === '') held[at] = ' '
    onChange(held.join('').trimEnd())
    focusBox(at + typed.length)
  }

  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-2', className)}>
      {/* What a native submit carries - otherwise FormData would find one digit per box. */}
      {name && <input type="hidden" name={name} value={value} />}
      {sizes.map((size, group) => {
        const start = sizes.slice(0, group).reduce((sum, before) => sum + before, 0)
        return (
          <div key={group} className="flex items-center gap-2">
            {group > 0 && (
              <span aria-hidden="true" className="text-muted-foreground select-none">
                –
              </span>
            )}
            <div className="flex gap-1.5">
              {Array.from({ length: size }, (_, offset) => {
                const at = start + offset
                return (
                  <input
                    key={at}
                    id={at === 0 ? id : undefined}
                    ref={(box) => {
                      boxes.current[at] = box
                    }}
                    aria-label={digitLabel(at + 1, total)}
                    // text rather than number: a spinner on a digit is nonsense, and number drops the
                    // leading zero a code may open with.
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    disabled={disabled}
                    autoFocus={autoFocus && at === 0}
                    value={value[at]?.trim() ?? ''}
                    // Selected on arrival, so typing over a filled box replaces its digit.
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => write(at, event.target.value.slice(-1))}
                    onKeyDown={(event) => {
                      // Written from the key, not left to onChange: a full box is at maxLength, and
                      // the browser drops the keystroke before any change event fires.
                      if (DIGIT.test(event.key)) {
                        event.preventDefault()
                        write(at, event.key)
                      } else if (event.key === 'Backspace' && !value[at]?.trim()) {
                        event.preventDefault()
                        write(Math.max(at - 1, 0), '')
                      } else if (event.key === 'ArrowLeft') {
                        event.preventDefault()
                        focusBox(at - 1)
                      } else if (event.key === 'ArrowRight') {
                        event.preventDefault()
                        focusBox(at + 1)
                      }
                    }}
                    // A code is copied whole, so a paste into any box fills from that box onward.
                    onPaste={(event) => {
                      event.preventDefault()
                      write(at, event.clipboardData.getData('text'))
                    }}
                    className="h-11 w-9 rounded-none border border-input bg-transparent text-center font-mono text-base tabular-nums shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
