import './globals.css'

import type { Metadata } from 'next'

import type React from 'react'

import { Toaster } from '@/components/base/sonner'
import { TooltipProvider } from '@/components/base/tooltip'

import MonkeyPatches from '@/app/monkeypatches'
import { PublicConfigScript } from '@/config/public'
import { SessionProvider } from '@/lib/SessionContext'
import { getSession } from '@/lib/getSession'

import { ThemeProvider } from 'next-themes'

export const metadata: Metadata = {
  title: '{{ cookiecutter.project_name }}',
  description: '{{ cookiecutter.description }}',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <MonkeyPatches />
      </head>
      <body>
        <PublicConfigScript />
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <SessionProvider session={session}>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
