import Link from 'next/link'

import type React from 'react'

import { LogoutButton } from '@/components/app-auth/LogoutButton'
import { ProfileTabsList } from '@/components/app-auth/ProfileTabsList'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { Avatar, AvatarFallback } from '@/components/base/avatar'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/base/card'

import { sUseTranslation } from '@/i18n'
import { getSession } from '@/lib/getSession'
import { getInitials } from '@/lib/utils'

export default async function ProfileTabsLayout({ children }: { children: React.ReactNode }) {
  // Gating already happened one level up, in profile/layout.tsx, on this same cache()-deduped
  // getSession() call - so this read is display data only and needn't redirect on its own.
  const session = await getSession()
  if (!session) {
    return null
  }
  const { user } = session
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    // w-full max-w-sm here too, matching the Card below (and AuthCard's own max-w-sm, so the
    // profile card reads as the same size as the login/signup card) - profile/layout.tsx's <main>
    // centers this column but doesn't stretch it, so without an explicit width of its own it's
    // pure shrink-to-fit: the Card's own w-full then resolves against whatever width THIS row's
    // content happens to need, which varies per tab (the tab strip needs more room than a short
    // form does) and produces a differently-sized card - and differently-squeezed rows within it
    // (see ProfileDetailsPage's dt/dd, docs/screenshots/profile/details.png) - on every tab.
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-3">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg leading-none font-semibold uppercase">
            {getInitials(user.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-base font-semibold">{user.username}</p>
          {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* ProfileTabsList wraps its own row onto a second line at this card width rather than
              overflowing or scrolling - see its own comment - so a plain centered flex here is
              enough; nothing here needs to manage overflow itself. */}
          <div className="flex justify-center">
            <ProfileTabsList />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">{children}</CardContent>
        {/* border-border, not a bare border-t - Tailwind v4 dropped the old implicit gray-200
            default border color (border-color now inherits currentColor), so an unqualified
            border-t here rendered as a solid dark line instead of the same hairline divider
            every other list in this app already uses explicitly (SessionsList, EmailsList,
            ConnectionsList all use divide-border). */}
        <CardFooter className="border-t border-border pt-6">
          <CardDescription className="flex w-full flex-col items-center gap-2 text-center">
            <Link href="/">{t('auth:profileBackToHomeLink')}</Link>
            <LogoutButton variant="ghost" size="sm" className="h-auto p-0 hover:bg-transparent hover:text-foreground" />
          </CardDescription>
        </CardFooter>
      </Card>
    </div>
  )
}
