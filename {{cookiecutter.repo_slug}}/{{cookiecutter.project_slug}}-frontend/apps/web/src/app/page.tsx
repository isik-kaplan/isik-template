import Link from 'next/link'

import { LogoutButton } from '@/components/app-auth/LogoutButton'
import { Button } from '@/components/base/button'

import { sUseTranslation } from '@/i18n'
import { applicationsAreOn, mayReviewApplications, maySeePeople } from '@/lib/access'
import { getSession } from '@/lib/getSession'
import { serverApi } from '@/lib/serverApi'

export default async function HomePage() {
  const session = await getSession()
  const { t } = await sUseTranslation(['auth'])
  // Only asked of somebody signed in: it decides which of the pages beyond their own profile they reach.
  const me = session ? (await (await serverApi()).me()).data : undefined

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t('auth:appTitle')}</h1>
      {session ? (
        <>
          <p className="text-muted-foreground">{t('auth:signedInAs', { username: session.user.username })}</p>
          <nav className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" render={<Link href="/profile" />}>
              {t('auth:homeProfileLink')}
            </Button>
            {applicationsAreOn() && (
              <Button variant="outline" render={<Link href="/applications" />}>
                {t('auth:homeApplicationsLink')}
              </Button>
            )}
            {me && maySeePeople(me) && (
              <Button variant="outline" render={<Link href="/staff/people" />}>
                {t('auth:homePeopleLink')}
              </Button>
            )}
            {me && mayReviewApplications(me) && (
              <Button variant="outline" render={<Link href="/staff/applications" />}>
                {t('auth:homeApplicationReviewsLink')}
              </Button>
            )}
          </nav>
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
