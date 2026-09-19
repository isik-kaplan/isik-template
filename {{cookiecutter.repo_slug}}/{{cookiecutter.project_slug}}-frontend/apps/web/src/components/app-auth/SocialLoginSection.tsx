'use client'

import type React from 'react'

import { SOCIAL_PROVIDERS } from '@/lib/socialProviders'

import { SeparatorWithText } from './SeparatorWithText'
import { SocialLoginButtons } from './SocialLoginButtons'

export type SocialLoginSectionProps = {
  action: string
  callbackUrl: string
  dividerText: React.ReactNode
}

// Buttons and their "or" divider are one unit: SOCIAL_PROVIDERS empty means neither renders,
// not a bare divider sitting above an email-only form.
export function SocialLoginSection({ action, callbackUrl, dividerText }: SocialLoginSectionProps) {
  if (SOCIAL_PROVIDERS.length === 0) return null

  return (
    <>
      <SocialLoginButtons action={action} callbackUrl={callbackUrl} />
      <SeparatorWithText>{dividerText}</SeparatorWithText>
    </>
  )
}
