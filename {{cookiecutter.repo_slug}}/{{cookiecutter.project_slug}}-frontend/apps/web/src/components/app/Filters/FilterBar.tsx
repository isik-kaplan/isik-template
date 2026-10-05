import type { ReactNode } from 'react'

// The row every filtered screen puts its controls in, so they line up and a change to how a filtered
// screen looks lands once.
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>
}
