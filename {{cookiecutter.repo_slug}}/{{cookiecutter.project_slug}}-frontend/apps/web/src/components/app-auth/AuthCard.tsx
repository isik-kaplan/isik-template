import Link from 'next/link'

import type React from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/base/card'

import { cn } from '@/lib/utils'

export function AuthCenteredLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full flex-1 items-center justify-center p-6">{children}</div>
}

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string
  description?: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {children}
        {footer}
      </CardContent>
    </Card>
  )
}

export function AuthCardFooterLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  // Always underlined: --primary has no chroma, so a standalone link would read as body text.
  // Inline by default, since some sit inside a sentence.
  return (
    <Link href={href} className={cn('text-primary text-sm underline underline-offset-4', className)}>
      {children}
    </Link>
  )
}
