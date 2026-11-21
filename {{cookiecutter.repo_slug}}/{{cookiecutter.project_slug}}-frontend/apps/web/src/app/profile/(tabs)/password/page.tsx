import { notFound } from 'next/navigation'

import { ChangePasswordForm } from '@/components/app-auth/ChangePasswordForm'

import { passwordsSignIn } from '@/lib/passwords'

export default function ProfilePasswordPage() {
  if (!passwordsSignIn()) notFound()
  return <ChangePasswordForm />
}
