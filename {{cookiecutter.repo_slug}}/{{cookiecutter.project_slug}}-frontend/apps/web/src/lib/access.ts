import { CONFIG } from '@/config/public'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

type Me = ApiType<'User'>

/** Whether there are applications here at all - the backend's OAUTH_PROVIDER__MODE. */
export function applicationsAreOn(): boolean {
  return CONFIG.OAUTH_PROVIDER.MODE !== 'off'
}

/** Who reads everybody's account - the backend's `may_see_every_account`, for a person in a session. */
export function maySeePeople(me: Me): boolean {
  return me.is_staff || me.permissions.includes('users:manage:user')
}

/** Superusers, while there are applications - the backend's MayReviewApplications. */
export function mayReviewApplications(me: Me): boolean {
  return me.is_superuser && applicationsAreOn()
}

/** Staff and superusers - the backend's IsStaff, which guards the site settings. */
export function mayChangeSiteSettings(me: Me): boolean {
  return me.is_staff || me.is_superuser
}

/** Changing a group is a grant to everybody in it - the backend's may_grant. */
export function mayChangeGroups(me: Me): boolean {
  return me.is_superuser || (me.is_staff && me.permissions.includes('users:grant:rights'))
}

/** Whoever has any part of the admin to see. */
export function mayEnterAdmin(me: Me): boolean {
  return maySeePeople(me) || mayReviewApplications(me) || mayChangeSiteSettings(me)
}
{%- if cookiecutter.webhooks == "staff" %}

/** Staff: the endpoints are the deployment's, and receive everybody's notices - the backend's MayManageEndpoints. */
export function mayManageWebhooks(me: Me): boolean {
  return me.is_staff
}
{%- elif cookiecutter.webhooks == "users" %}

/** Anybody signed in: each person's endpoints receive only their own notices. */
export function mayManageWebhooks(_me: Me): boolean {
  return true
}
{%- endif %}
