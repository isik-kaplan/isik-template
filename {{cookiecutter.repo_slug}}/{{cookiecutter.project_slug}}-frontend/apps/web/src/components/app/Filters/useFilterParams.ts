'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { ANY } from './filterSpec'

// The URL is the filter: a narrowed listing is something somebody pastes into a ticket, and the
// server is what narrows it either way.
export function useFilterParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return {
    /** What one filter currently holds, or '' - which every control reads as unset. */
    held: (name: string) => searchParams.get(name) ?? '',
    show(name: string, value: string) {
      const next = new URLSearchParams(searchParams)
      if (!value || value === ANY) {
        next.delete(name)
      } else {
        next.set(name, value)
      }
      // Back to the first page: page 4 of the old filter is rarely a page of the new one, and
      // landing on an empty page reads as "nothing matched".
      next.delete('page')
      router.push(`${pathname}?${next}`)
    },
  }
}
