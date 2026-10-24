import type { ReactNode } from 'react'

// The row every filtered screen puts its controls in.
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>
}
