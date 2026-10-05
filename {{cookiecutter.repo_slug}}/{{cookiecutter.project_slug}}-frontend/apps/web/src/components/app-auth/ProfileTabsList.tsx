'use client'

import { usePathname, useRouter } from 'next/navigation'

import { KeyRoundIcon, Link2Icon, MailIcon, MonitorSmartphoneIcon, ShieldCheckIcon, UserIcon } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/base/tabs'

import { useClientTranslation } from '@/i18n/client'

const TABS = [
  { segment: 'details', icon: UserIcon },
  { segment: 'password', icon: KeyRoundIcon },
  { segment: 'emails', icon: MailIcon },
  { segment: 'connections', icon: Link2Icon },
  { segment: 'sessions', icon: MonitorSmartphoneIcon },
  { segment: 'two-factor', icon: ShieldCheckIcon },
] as const

export function ProfileTabsList() {
  const { t } = useClientTranslation(['auth'])
  const pathname = usePathname()
  const router = useRouter()
  const active = TABS.find((tab) => pathname.endsWith(`/profile/${tab.segment}`))?.segment ?? TABS[0].segment

  // i18next-parser only detects a literal string argument, not a key looked up from TABS, so
  // these are spelled out. Don't write the detected call shape into a comment - it gets collected.
  const labels: Record<(typeof TABS)[number]['segment'], string> = {
    details: t('auth:profileDetailsTab'),
    password: t('auth:profilePasswordTab'),
    emails: t('auth:profileEmailsTab'),
    connections: t('auth:profileConnectionsTab'),
    sessions: t('auth:profileSessionsTab'),
    'two-factor': t('auth:profileTwoFactorTab'),
  }

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        const nextPath = pathname.replace(/\/profile\/[^/]+$/, `/profile/${value}`)
        router.push(nextPath)
      }}
    >
      {/* w-full, not the base component's own w-fit: stretches the strip to the card's width so
          TabsTrigger's own flex-1 (base/tabs.tsx) divides it evenly, instead of every trigger
          shrinking to its own text and leaving the row short of the card's edge. Six labels do not
          fit one row at the card's max-w-sm width, so the base strip wraps them onto a second. */}
      <TabsList className="w-full">
        {TABS.map(({ segment, icon: Icon }) => (
          <TabsTrigger key={segment} value={segment}>
            {/* Icon below `sm`, label at/above it - never both at once, which would make every trigger
                wide enough to wrap even on a phone. */}
            <Icon className="size-4 sm:hidden" />
            {/* `hidden` (display:none) removes text from the accessible name entirely below `sm` -
                not just visually, screen readers get nothing either. `sr-only` keeps it in the
                accessibility tree at every width; `sm:not-sr-only` is what actually shows it visually
                at/above the breakpoint. */}
            <span className="sr-only sm:not-sr-only sm:inline">{labels[segment]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
