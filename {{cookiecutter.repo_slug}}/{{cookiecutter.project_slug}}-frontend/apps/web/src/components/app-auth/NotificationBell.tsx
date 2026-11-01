'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useEffect, useState } from 'react'

import { BellIcon } from 'lucide-react'

import { buttonVariants } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { cn } from '@/lib/utils'

/** Sent on window once something marks notifications read, so a bell on the same page counts again. */
export const NOTIFICATIONS_READ = 'notifications-read'

// Past this the exact number stops meaning anything; the inbox says it properly.
const MOST_SHOWN = 99

/** How many notifications are unread, as a way into the inbox. */
export function NotificationBell() {
  const { t } = useClientTranslation(['auth'])
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  // Counted on arriving at a page and whenever something is marked read, rather than polled.
  useEffect(() => {
    let current = true
    async function count() {
      // One row is enough: the page's `count` is the number.
      const { data } = await createApi(apiOrigin()).notifications({ unread: true, page_size: 1 })
      if (current) setUnread(data?.count ?? 0)
    }
    count()
    window.addEventListener(NOTIFICATIONS_READ, count)
    return () => {
      current = false
      window.removeEventListener(NOTIFICATIONS_READ, count)
    }
  }, [pathname])

  return (
    <Link
      href="/profile/notifications"
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')}
      aria-label={unread > 0 ? t('auth:notificationBellUnread', { count: unread }) : t('auth:notificationBellLabel')}
    >
      <BellIcon className="size-4" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground"
        >
          {unread > MOST_SHOWN ? `${MOST_SHOWN}+` : unread}
        </span>
      )}
    </Link>
  )
}
