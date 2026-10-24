import type React from 'react'

import { Skeleton } from '@/components/base/skeleton'

import { cn } from '@/lib/utils'

/** Blocks its children while loading without unmounting them, so they keep scroll and layout. */
export function LoadingOverlay({
  loading = false,
  disabled = false,
  message,
  children,
  className,
}: {
  loading?: boolean
  disabled?: boolean
  message?: string
  children: React.ReactNode
  className?: string
}) {
  const active = loading || disabled
  return (
    <div className={cn('relative', className)}>
      <div className={cn(active && 'pointer-events-none opacity-50 transition-opacity')} aria-hidden={active}>
        {children}
      </div>
      {active && (
        <div className="absolute inset-0 flex items-center justify-center">
          {loading && <Skeleton className="h-8 w-24" />}
          {!loading && message && <p className="text-muted-foreground text-sm">{message}</p>}
        </div>
      )}
    </div>
  )
}
