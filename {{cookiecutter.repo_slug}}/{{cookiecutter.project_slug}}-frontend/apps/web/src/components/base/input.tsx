import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

function Input({ className, type, errorText, ...props }: React.ComponentProps<'input'> & { errorText?: string }) {
  return (
    <div className="block w-full">
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(
          'flex h-9 w-full min-w-0 rounded-none border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          className
        )}
        {...props}
      />
      {errorText && <span className="mt-1.5 block text-xs whitespace-pre-line text-destructive">{errorText}</span>}
    </div>
  )
}

export { Input }
