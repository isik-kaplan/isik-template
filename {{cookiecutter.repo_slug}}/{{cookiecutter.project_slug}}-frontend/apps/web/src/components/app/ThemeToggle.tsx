'use client'

import { MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n'

import { useTheme } from 'next-themes'

export function ThemeToggle() {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'themeToggle:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['themeToggle'])
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={resolvedTheme === 'dark' ? t('themeToggle:switchToLight') : t('themeToggle:switchToDark')}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <SunIcon className="size-4 scale-100 rotate-0 dark:scale-0 dark:-rotate-90" />
      <MoonIcon className="absolute size-4 scale-0 rotate-90 dark:scale-100 dark:rotate-0" />
    </Button>
  )
}
