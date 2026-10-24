'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { ANY } from './filterSpec'

// The URL is the filter, so a narrowed listing can be shared.
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
      // Back to page 1: a later page may be empty under the new filter, reading as "nothing matched".
      next.delete('page')
      router.push(`${pathname}?${next}`)
    },
  }
}
