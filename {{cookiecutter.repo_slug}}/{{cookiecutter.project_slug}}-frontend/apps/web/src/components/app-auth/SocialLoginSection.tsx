'use client'

import type React from 'react'

import { signInProviders } from '@/lib/socialProviders'

import { SeparatorWithText } from './SeparatorWithText'
import { SocialLoginButtons } from './SocialLoginButtons'

export type SocialLoginSectionProps = {
  action: string
  callbackUrl: string
  // Left out when nothing follows the buttons.
  dividerText?: React.ReactNode
  // On the admin's sign-in page, which offers the admin-only providers too.
  admin?: boolean
}

// No providers means no divider either.
export function SocialLoginSection({ action, callbackUrl, dividerText, admin = false }: SocialLoginSectionProps) {
  if (signInProviders(admin).length === 0) return null

  return (
    <>
      <SocialLoginButtons action={action} callbackUrl={callbackUrl} admin={admin} />
      {dividerText && <SeparatorWithText>{dividerText}</SeparatorWithText>}
    </>
  )
}
