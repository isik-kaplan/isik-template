import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'
{%- if cookiecutter.background_jobs == "celery-with-beat" %}

import { mayChangeSiteSettings, mayReviewApplications, mayRunScheduledTasks, maySeePeople } from './access'
{%- else %}

import { mayChangeSiteSettings, mayReviewApplications, maySeePeople } from './access'
{%- endif %}

type Me = ApiType<'User'>

export type AdminSection = {
  href: string
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
  labelKey:
    | 'auth:adminPeople'
    | 'auth:adminGroups'
    | 'auth:adminApplications'
    | 'auth:adminSettings'
    | 'auth:adminScheduledTasks'
{%- else %}
  labelKey: 'auth:adminPeople' | 'auth:adminGroups' | 'auth:adminApplications' | 'auth:adminSettings'
{%- endif %}
}

/** The parts of the admin `me` may see, in the order its navigation lists them. Paths are admin.<domain>'s. */
export function adminSections(me: Me): AdminSection[] {
  return [
    ...(maySeePeople(me)
      ? [
          { href: '/people', labelKey: 'auth:adminPeople' as const },
          { href: '/groups', labelKey: 'auth:adminGroups' as const },
        ]
      : []),
    ...(mayReviewApplications(me) ? [{ href: '/app-approvals', labelKey: 'auth:adminApplications' as const }] : []),
    ...(mayChangeSiteSettings(me) ? [{ href: '/settings', labelKey: 'auth:adminSettings' as const }] : []),
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
    ...(mayRunScheduledTasks(me) ? [{ href: '/scheduled-tasks', labelKey: 'auth:adminScheduledTasks' as const }] : []),
{%- endif %}
  ]
}
