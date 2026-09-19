import type React from 'react'

import { AuthCenteredLayout } from '@/components/app-auth/AuthCard'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthCenteredLayout>{children}</AuthCenteredLayout>
}
