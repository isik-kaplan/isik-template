import Link from 'next/link'

import type React from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/base/card'

import { cn } from '@/lib/utils'

export function AuthCenteredLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh w-full items-center justify-center p-6">{children}</div>
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
  // Underlined unconditionally, not just on hover - text-primary is a near-black neutral in this
  // theme (see globals.css, --primary has 0 chroma), close enough to plain --foreground that a
  // standalone link (no lighter-colored sibling text to contrast against, e.g. the forgot-password
  // and provider-error "back to login" links below) otherwise reads as plain body text, not
  // something clickable. className lets standalone call sites also center it (block text-center) -
  // this can't default to block itself, since the signup/login links above nest this inline inside
  // a sentence (e.g. "Don't have an account? Sign up").
  return (
    <Link href={href} className={cn('text-primary text-sm underline underline-offset-4', className)}>
      {children}
    </Link>
  )
}
