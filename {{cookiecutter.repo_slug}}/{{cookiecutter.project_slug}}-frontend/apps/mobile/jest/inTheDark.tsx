import type { ReactNode } from 'react'

import { ThemeProvider } from '@/theme'

/** Render options that draw in the dark, so a colour read from the light palette would show. */
export const inTheDark = {
  wrapper: ({ children }: { children: ReactNode }) => (
    <ThemeProvider appearance="dark" choose={() => undefined}>
      {children}
    </ThemeProvider>
  ),
}
