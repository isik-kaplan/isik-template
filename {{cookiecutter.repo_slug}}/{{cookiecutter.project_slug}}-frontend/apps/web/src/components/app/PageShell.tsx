import Link from 'next/link'

import type React from 'react'

import { LanguageSwitcher } from '@/components/app-auth/LanguageSwitcher'
import { ThemeToggle } from '@/components/app/ThemeToggle'

/** A page wider than the sign-in card, for lists and the settings of one thing: a title, what the page is
 *  for, and the way back. */
export function PageShell({
  title,
  description,
  backHref,
  backLabel,
  children,
}: {
  title: string
  description?: string
  backHref: string
  backLabel: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 pt-16">
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <Link href={backHref} className="text-sm text-muted-foreground underline underline-offset-4">
        {backLabel}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </main>
  )
}
