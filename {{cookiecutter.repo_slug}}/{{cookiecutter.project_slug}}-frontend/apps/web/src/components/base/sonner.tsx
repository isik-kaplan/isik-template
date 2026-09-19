'use client'

import type React from 'react'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'

// Hoisted out of the JSX below, not inlined as a double-curly-brace JSX object attribute - this
// file is itself a Jinja template (cookiecutter renders every file), and that syntax is
// indistinguishable from a real Jinja expression to the renderer.
const toasterIcons: ToasterProps['icons'] = {
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
}

const toasterStyle = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': '0px',
} as React.CSSProperties

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={toasterIcons}
      style={toasterStyle}
      {...props}
    />
  )
}

export { Toaster }
