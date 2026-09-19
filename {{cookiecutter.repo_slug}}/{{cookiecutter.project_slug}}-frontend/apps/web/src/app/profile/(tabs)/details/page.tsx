import { sUseTranslation } from '@/i18n'
import { requireSession } from '@/lib/getSession'

export default async function ProfileDetailsPage() {
  const session = await requireSession()
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t('auth:profileDetailsUsernameLabel')}</dt>
        <dd>{session.user.username}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t('auth:profileDetailsEmailLabel')}</dt>
        <dd>{session.user.email}</dd>
      </div>
    </dl>
  )
}
