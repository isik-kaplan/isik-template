'use client'

import { useState } from 'react'
import type React from 'react'

import { EyeIcon, EyeOffIcon } from 'lucide-react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'

import { useClientTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

export function PasswordInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative">
      <Input type={revealed ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 hover:bg-transparent"
        aria-label={revealed ? t('auth:hidePasswordLabel') : t('auth:showPasswordLabel')}
        onClick={() => setRevealed((value) => !value)}
      >
        {revealed ? (
          <EyeOffIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <EyeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}
