'use client'

import { usePathname, useRouter } from 'next/navigation'

import { KeyRoundIcon, Link2Icon, MailIcon, MonitorSmartphoneIcon, UserIcon } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/base/tabs'

import { useClientTranslation } from '@/i18n'

const TABS = [
  { segment: 'details', icon: UserIcon },
  { segment: 'password', icon: KeyRoundIcon },
  { segment: 'emails', icon: MailIcon },
  { segment: 'connections', icon: Link2Icon },
  { segment: 'sessions', icon: MonitorSmartphoneIcon },
] as const

export function ProfileTabsList() {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
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
          shrinking to its own text and leaving the row short of the card's edge. Labels (auth
          locale's profile*Tab keys) are kept short enough to all fit on this one row at the
          card's max-w-sm width - profileConnectionsTab reads "Links" rather than "Connections"
          for exactly this reason. */}
      <TabsList className="w-full">
        {TABS.map(({ segment, icon: Icon }) => (
          <TabsTrigger key={segment} value={segment}>
            {/* Icon below `sm`, label at/above it - never both at once. Five of these in one row
                (see docs/screenshots/profile) overflow the tab strip's own width if a label runs
                alongside its icon at every size, not just narrow ones. */}
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
