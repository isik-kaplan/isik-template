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
