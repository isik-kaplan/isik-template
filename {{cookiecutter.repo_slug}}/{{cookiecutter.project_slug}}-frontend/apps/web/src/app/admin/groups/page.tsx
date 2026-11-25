import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { Asked } from '@/components/app/Filters/filterSpec'
import { pagedQueryFrom } from '@/components/app/Filters/paging'
import { PageShell } from '@/components/app/PageShell'
import { ResourcePaginator } from '@/components/app/ResourcePaginator'
import { Button } from '@/components/base/button'

import { sUseTranslation } from '@/i18n'
import { mayChangeGroups, maySeePeople } from '@/lib/access'
import { serverApi } from '@/lib/serverApi'

/** Every group and what it gives, for whoever reads every account. */
export default async function GroupsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const api = await serverApi()
  const { data: me } = await api.me()
  if (!me || !maySeePeople(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const asked = await searchParams
  const { data } = await api.groups(pagedQueryFrom([], asked))
  const groups = data?.results ?? []
  // Awaited rather than nested as an element: an async element only renders under a server renderer.
  const paginator = await ResourcePaginator({ specs: [], asked, totalPages: data?.total_pages ?? 0 })

  return (
    <PageShell title={t('auth:groupsTitle')} description={t('auth:groupsHint')}>
      {mayChangeGroups(me) && (
        <Button className="self-start" render={<Link href="/groups/new" />}>
          {t('auth:groupNew')}
        </Button>
      )}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:groupsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <Link href={`/groups/${group.id}`} className="font-medium underline-offset-4 hover:underline">
                {group.name}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">
                {(group.permissions ?? []).join(' · ') || t('auth:groupGivesNothing')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {paginator}
    </PageShell>
  )
}
