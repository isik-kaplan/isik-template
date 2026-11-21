'use client'

import { usePathname, useRouter } from 'next/navigation'

import {
  AppWindowIcon,
  BellIcon,
  KeyRoundIcon,
  Link2Icon,
  MailIcon,
  MonitorSmartphoneIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  TerminalIcon,
  UserIcon,
} from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/base/tabs'

import { PHONE } from '@/config/phone'
import { CONFIG } from '@/config/public'
import { useClientTranslation } from '@/i18n/client'
import { passwordsSignIn } from '@/lib/passwords'

const TABS = [
  { segment: 'details', icon: UserIcon },
  { segment: 'notifications', icon: BellIcon },
  { segment: 'settings', icon: SlidersHorizontalIcon },
  { segment: 'password', icon: KeyRoundIcon },
  { segment: 'emails', icon: MailIcon },
  { segment: 'phone', icon: SmartphoneIcon },
  { segment: 'connections', icon: Link2Icon },
  { segment: 'sessions', icon: MonitorSmartphoneIcon },
  { segment: 'two-factor', icon: ShieldCheckIcon },
  { segment: 'tokens', icon: TerminalIcon },
  { segment: 'applications', icon: AppWindowIcon },
] as const

export function ProfileTabsList() {
  const { t } = useClientTranslation(['auth'])
  const pathname = usePathname()
  const router = useRouter()
  // Applications only while the backend is an OAuth provider at all; phone only while accounts have numbers;
  // password only while one signs in.
  const tabs = TABS.filter(
    (tab) =>
      (tab.segment !== 'applications' || CONFIG.OAUTH_PROVIDER.MODE !== 'off') &&
      (tab.segment !== 'phone' || PHONE !== 'none') &&
      (tab.segment !== 'password' || passwordsSignIn())
  )
  const active = tabs.find((tab) => pathname.endsWith(`/profile/${tab.segment}`))?.segment ?? tabs[0].segment

  // Spelled out: i18next-parser only detects literal keys, and collects them from comments too.
  const labels: Record<(typeof TABS)[number]['segment'], string> = {
    details: t('auth:profileDetailsTab'),
    notifications: t('auth:profileNotificationsTab'),
    settings: t('auth:profileSettingsTab'),
    password: t('auth:profilePasswordTab'),
    emails: t('auth:profileEmailsTab'),
    phone: t('auth:profilePhoneTab'),
    connections: t('auth:profileConnectionsTab'),
    sessions: t('auth:profileSessionsTab'),
    'two-factor': t('auth:profileTwoFactorTab'),
    tokens: t('auth:profileTokensTab'),
    applications: t('auth:profileApplicationsTab'),
  }

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        const nextPath = pathname.replace(/\/profile\/[^/]+$/, `/profile/${value}`)
        router.push(nextPath)
      }}
    >
      {/* w-full, not w-fit, so the triggers' flex-1 divides the card's width evenly. */}
      <TabsList className="w-full">
        {tabs.map(({ segment, icon: Icon }) => (
          <TabsTrigger key={segment} value={segment}>
            {/* Icon below `sm`, label above: both would wrap on a phone. */}
            <Icon className="size-4 sm:hidden" />
            {/* sr-only, not hidden, which would drop it from the accessible name too. */}
            <span className="sr-only sm:not-sr-only sm:inline">{labels[segment]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
