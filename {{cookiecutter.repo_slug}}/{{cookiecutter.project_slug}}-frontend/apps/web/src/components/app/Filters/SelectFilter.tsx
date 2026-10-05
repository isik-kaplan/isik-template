'use client'

import { Label } from '@/components/base/label'

import { cn } from '@/lib/utils'

import { ANY } from './filterSpec'
import type { FilterOption } from './filterSpec'
import { useFilterParams } from './useFilterParams'

export type SelectFilterProps = {
  /** The query parameter this control owns. */
  name: string
  label: string
  /** What "no filter" reads as. Its value is `ANY`, which never reaches the query. */
  anyLabel: string
  options: FilterOption[]
  className?: string
}

// A native select, styled like LanguageSwitcher's: one of a fixed set needs nothing a custom listbox
// adds, and the browser's own picker is the one a phone user already knows.
export function SelectFilter({ name, label, anyLabel, options, className }: SelectFilterProps) {
  const { held, show } = useFilterParams()

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`filter-${name}`}>{label}</Label>
      <select
        id={`filter-${name}`}
        value={held(name) || ANY}
        onChange={(event) => show(name, event.target.value)}
        className={cn(
          'h-9 w-48 rounded-none border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <option value={ANY}>{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
