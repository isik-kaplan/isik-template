'use client'

import type { ReactNode } from 'react'

import { FilterBar } from './FilterBar'
import { SelectFilter } from './SelectFilter'
import type { FilterSpec } from './filterSpec'

/** A listing's controls from one declaration; `children` for a filter that is not one API parameter. */
export function ResourceFilters<Query>({ specs, children }: { specs: FilterSpec<Query>[]; children?: ReactNode }) {
  return (
    <FilterBar>
      {specs.map((spec) => (
        <SelectFilter
          key={spec.name}
          name={spec.name}
          label={spec.label}
          anyLabel={spec.anyLabel}
          options={spec.options}
        />
      ))}
      {children}
    </FilterBar>
  )
}
