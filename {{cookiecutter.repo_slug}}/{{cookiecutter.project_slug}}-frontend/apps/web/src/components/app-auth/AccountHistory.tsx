import { ResourceFilters } from '@/components/app/Filters/ResourceFilters'
import { filtersFor } from '@/components/app/Filters/filterSpec'
import type { Asked } from '@/components/app/Filters/filterSpec'
import { pagedQueryFrom } from '@/components/app/Filters/paging'
import { ResourcePaginator } from '@/components/app/ResourcePaginator'

import { sUseTranslation } from '@/i18n'
import { getLanguage } from '@/lib/getSession'
import { changedFields, historyActionLabels, historyFieldLabels } from '@/lib/historyLabels'
import { serverApi } from '@/lib/serverApi'

import type { ApiQuery } from '@{{ cookiecutter.repo_slug }}/api'

type HistoryQuery = NonNullable<ApiQuery<'/v0/users/{id}/history/'>>

/** What happened to this account, newest first, narrowed by the address bar. */
export async function AccountHistory({ userId, asked }: { userId: string; asked: Asked }) {
  const { t } = await sUseTranslation(['auth'])
  const language = await getLanguage()
  const actions = historyActionLabels(t)
  const fields = historyFieldLabels(t)
  // No `delete`: an account that has been deleted cannot sign in to read its own history.
  const specs = [
    filtersFor<HistoryQuery>().on({
      name: 'action',
      label: t('auth:profileHistoryActionFilter'),
      anyLabel: t('auth:profileHistoryActionAny'),
      options: [
        { value: 'insert', label: actions.insert },
        { value: 'update', label: actions.update },
      ],
    }),
  ]
  const api = await serverApi()
  // Past the last page DRF answers 404, which reads here as nothing to show rather than a crash.
  const { data } = await api.userHistory(userId, pagedQueryFrom(specs, asked))
  const events = data?.results ?? []
  // Awaited rather than nested as an element: an async element only renders under a server renderer.
  const paginator = await ResourcePaginator({ specs, asked, totalPages: data?.total_pages ?? 0 })
  const when = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <h2 className="text-sm font-semibold">{t('auth:profileHistoryTitle')}</h2>
      <ResourceFilters specs={specs} />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:profileHistoryEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {events.map((event) => {
            // The document types a history row's JSON `changes` and its `action` as plain JSON and string.
            const changed = changedFields(event.changes as Record<string, unknown> | null, fields)
            return (
              <li key={event.event_id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                <div className="flex justify-between gap-4">
                  <span className="font-medium">{actions[event.action as keyof typeof actions]}</span>
                  <time dateTime={event.event_created_at} className="text-muted-foreground">
                    {when.format(new Date(event.event_created_at))}
                  </time>
                </div>
                {event.action === 'update' && changed.length > 0 && (
                  <span className="text-muted-foreground">{changed.join(', ')}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {paginator}
    </section>
  )
}
