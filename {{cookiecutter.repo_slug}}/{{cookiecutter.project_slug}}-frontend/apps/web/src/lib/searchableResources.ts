import type { Translate } from '@/i18n/config'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { applicationsAreOn, {% if cookiecutter.webhooks != "none" %}mayManageWebhooks, {% endif %}mayReviewApplications, maySeePeople } from './access'
import { createApi } from './apiClients'
import { apiOrigin } from './apiOrigin'
import { personLabel } from './names'
import { parseQuery, queryFrom } from './queryGrammar'

type Me = ApiType<'User'>

/** One thing the palette found, as every resource renders it. */
export type SearchHit = { id: string; title: string; subtitle?: string | null; href: string }

export type SearchableResource = {
  // The grammar's name for the resource, and what keeps a hit's key unique across groups.
  key: string
  label: string
  search(query: Record<string, string>): Promise<SearchHit[]>
}

/** Somewhere the palette goes without searching for it. */
export type Destination = { href: string; label: string }

// A glance of each resource: the listing behind it paginates the rest.
const AT_A_GLANCE = 5

// The grammar lets only declared fields through, and DRF parses each value from its string.
function narrowed<Query>(query: Record<string, string>): Query {
  return { ...query, page_size: AT_A_GLANCE } as Query
}

/** Where this person may go, for the palette to offer before anything is typed. */
export function destinationsFor(me: Me | undefined, t: Translate): Destination[] {
  return [
    { href: '/', label: t('auth:paletteHome') },
    { href: '/profile', label: t('auth:homeProfileLink') },
    { href: '/profile/notifications', label: t('auth:profileNotificationsTab') },
    ...(applicationsAreOn() ? [{ href: '/applications', label: t('auth:homeApplicationsLink') }] : []),
    ...(me && maySeePeople(me) ? [{ href: '/staff/people', label: t('auth:homePeopleLink') }] : []),
    ...(me && mayReviewApplications(me)
      ? [{ href: '/staff/applications', label: t('auth:homeApplicationReviewsLink') }]
      : []),
{%- if cookiecutter.webhooks != "none" %}
    ...(me && mayManageWebhooks(me) ? [{ href: '/webhooks', label: t('auth:homeWebhooksLink') }] : []),
{%- endif %}
  ]
}

/**
 * What this person can search, each through a list endpoint that already narrows to what they may
 * read. Grouped and never merged into one ranking: relevance is not comparable across querysets.
 */
export function searchableResources(me: Me, t: Translate): SearchableResource[] {
  const api = createApi(apiOrigin())
  const resources: SearchableResource[] = []
  if (maySeePeople(me)) {
    resources.push({
      key: 'users',
      label: t('auth:homePeopleLink'),
      async search(query) {
        const { data } = await api.users(narrowed(query))
        return (data?.results ?? []).map((user) => ({
          id: user.id,
          title: personLabel(user),
          subtitle: user.email,
          href: `/staff/people/${user.id}`,
        }))
      },
    })
  }
  if (applicationsAreOn()) {
    resources.push({
      key: 'applications',
      label: t('auth:homeApplicationsLink'),
      async search(query) {
        const { data } = await api.oauthApplications(narrowed(query))
        return (data?.results ?? []).map((application) => ({
          id: String(application.id),
          title: application.name,
          subtitle: application.client_id,
          href: `/applications/${application.id}`,
        }))
      },
    })
  }
  if (mayReviewApplications(me)) {
    resources.push({
      key: 'applicationReviews',
      label: t('auth:homeApplicationReviewsLink'),
      async search(query) {
        const { data } = await api.oauthApplicationReviews(narrowed(query))
        return (data?.results ?? []).map((application) => ({
          id: String(application.id),
          title: application.name,
          subtitle: application.owner,
          href: `/staff/applications/${application.id}`,
        }))
      },
    })
  }
  resources.push({
    key: 'notifications',
    label: t('auth:profileNotificationsTab'),
    async search(query) {
      const { data } = await api.notifications(narrowed(query))
      // The inbox is one page, so every hit leads there.
      return (data?.results ?? []).map((item) => ({
        id: item.id,
        title: item.message ?? item.kind,
        href: '/profile/notifications',
      }))
    },
  })
{%- if cookiecutter.webhooks != "none" %}
  if (mayManageWebhooks(me)) {
    resources.push({
      key: 'webhooks',
      label: t('auth:homeWebhooksLink'),
      async search(query) {
        const { data } = await api.notificationEndpoints(narrowed(query))
        return (data?.results ?? []).map((endpoint) => ({ id: endpoint.id, title: endpoint.url, href: '/webhooks' }))
      },
    })
  }
{%- endif %}
  return resources
}

/** What each resource should be asked for what was typed; one whose grammar refuses it asks nothing. */
export function askedOf(resources: SearchableResource[], typed: string) {
  return resources.map((resource) => {
    const parsed = parseQuery(resource.key, typed)
    return { resource, query: parsed.problem ? null : queryFrom(parsed), problem: parsed.problem }
  })
}
