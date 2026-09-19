import Link from 'next/link'

import { LogoutButton } from '@/components/app-auth/LogoutButton'
import { Button } from '@/components/base/button'

import { sUseTranslation } from '@/i18n'
import { getSession } from '@/lib/getSession'

export default async function HomePage() {
  const session = await getSession()
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t('auth:appTitle')}</h1>
      {session ? (
        <>
          <p className="text-muted-foreground">{t('auth:signedInAs', { username: session.user.username })}</p>
          <LogoutButton />
        </>
      ) : (
        <div className="flex gap-2">
          <Button render={<Link href="/auth/login" />}>{t('auth:loginLink')}</Button>
          <Button variant="outline" render={<Link href="/auth/signup" />}>
            {t('auth:signupLink')}
          </Button>
        </div>
      )}
    </main>
  )
}
