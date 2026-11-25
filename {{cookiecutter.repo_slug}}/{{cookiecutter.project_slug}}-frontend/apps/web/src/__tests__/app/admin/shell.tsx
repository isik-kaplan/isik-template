import type React from 'react'

/** A PageShell that renders what it was handed and nothing of its own, for the admin's page tests. */
export function TestPageShell({
  title,
  description,
  backHref,
  backLabel,
  children,
}: {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  children: React.ReactNode
}) {
  return (
    <main>
      <h1>{title}</h1>
      {description && <p data-testid="description">{description}</p>}
      {backHref && <a href={backHref}>{backLabel}</a>}
      {children}
    </main>
  )
}
