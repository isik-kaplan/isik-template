import type React from 'react'

import { Separator } from '@/components/base/separator'

export function SeparatorWithText({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <Separator />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card text-muted-foreground px-2">{children}</span>
      </div>
    </div>
  )
}
