'use client'

import type { ReactNode } from 'react'

import { FilterBar } from './FilterBar'
import { SelectFilter } from './SelectFilter'
import type { FilterSpec } from './filterSpec'

/**
 * Every control a listing offers, from one declaration. `children` is the escape hatch for a filter
 * that is not a single API parameter, passed in beside the declared ones.
 */
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
