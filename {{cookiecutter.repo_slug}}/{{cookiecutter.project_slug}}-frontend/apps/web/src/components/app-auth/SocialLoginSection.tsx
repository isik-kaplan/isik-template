'use client'

import type React from 'react'

import { socialProviders } from '@/lib/socialProviders'

import { SeparatorWithText } from './SeparatorWithText'
import { SocialLoginButtons } from './SocialLoginButtons'

export type SocialLoginSectionProps = {
  action: string
  callbackUrl: string
  dividerText: React.ReactNode
}

// No providers means no divider either.
export function SocialLoginSection({ action, callbackUrl, dividerText }: SocialLoginSectionProps) {
  if (socialProviders().length === 0) return null

  return (
    <>
      <SocialLoginButtons action={action} callbackUrl={callbackUrl} />
      <SeparatorWithText>{dividerText}</SeparatorWithText>
    </>
  )
}
