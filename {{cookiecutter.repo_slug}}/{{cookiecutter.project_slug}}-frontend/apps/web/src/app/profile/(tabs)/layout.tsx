import Link from 'next/link'

import type React from 'react'

import { LanguageSwitcher } from '@/components/app-auth/LanguageSwitcher'
import { LogoutButton } from '@/components/app-auth/LogoutButton'
import { ProfileTabsList } from '@/components/app-auth/ProfileTabsList'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { Avatar, AvatarFallback } from '@/components/base/avatar'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/base/card'

import { sUseTranslation } from '@/i18n'
import { getSession } from '@/lib/getSession'
import { getInitials } from '@/lib/utils'

export default async function ProfileTabsLayout({ children }: { children: React.ReactNode }) {
  // Gated in profile/layout.tsx on the same cached getSession(), so this read is display only.
  const session = await getSession()
  if (!session) {
    return null
  }
  const { user } = session
  const { t } = await sUseTranslation(['auth'])

  return (
    // An explicit width: the centered <main> doesn't stretch this column, so the card would
    // shrink to each tab's content and change size per tab.
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
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
          {/* ProfileTabsList wraps its own row, so no overflow handling is needed here. */}
          <div className="flex justify-center">
            <ProfileTabsList />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">{children}</CardContent>
        {/* border-border: Tailwind v4 has no default border color, so a bare border-t draws dark. */}
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
