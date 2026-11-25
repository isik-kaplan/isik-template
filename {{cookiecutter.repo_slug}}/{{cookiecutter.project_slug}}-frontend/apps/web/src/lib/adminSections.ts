import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { mayChangeSiteSettings, mayReviewApplications, maySeePeople } from './access'

type Me = ApiType<'User'>

export type AdminSection = {
  href: string
  labelKey: 'auth:adminPeople' | 'auth:adminGroups' | 'auth:adminApplications' | 'auth:adminSettings'
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
  ]
}
