import Link from 'next/link'

import type { ReactNode } from 'react'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { buttonVariants } from '@/components/base/button'

import { sUseTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

type QueryParams = Record<string, string | number | boolean | undefined>

// A step past either end is a span rather than a link: a link that goes nowhere is one more thing a
// keyboard user tabs through for nothing.
function Step({ href, label, children }: { href?: { query: QueryParams }; label: string; children: ReactNode }) {
  const look = cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))
  if (!href) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(look, 'pointer-events-none opacity-50')}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} aria-label={label} className={look}>
      {children}
    </Link>
  )
}

/** Previous and next links that keep `queryParams`. Renders nothing at a single page. */
export async function Paginator({
  queryParams,
  currentPage,
  totalPages,
}: {
  queryParams: QueryParams
  currentPage: number
  totalPages: number
}) {
  const { t } = await sUseTranslation(['common'])

  if (totalPages <= 1) {
    return null
  }
  const to = (page: number) => ({ query: { ...queryParams, page } })

  return (
    <nav className="flex items-center justify-end gap-2 text-sm">
      <Step href={currentPage > 1 ? to(currentPage - 1) : undefined} label={t('common:previousPage')}>
        <ChevronLeftIcon />
      </Step>
      <span className="text-muted-foreground">{t('common:pageOfTotal', { page: currentPage, total: totalPages })}</span>
      <Step href={currentPage < totalPages ? to(currentPage + 1) : undefined} label={t('common:nextPage')}>
        <ChevronRightIcon />
      </Step>
    </nav>
  )
}
