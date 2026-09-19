// Static, not fetched from the backend - social login is settings-based (see the backend's
// SOCIALACCOUNT_PROVIDERS), not a DB-backed SocialApp list, so there's nothing to query at
// request time. Resolved once at generation time from the same social_login_providers answer.
// "all" isn't expanded here the way it is in settings.py - a login page with ~90 buttons isn't
// good UX regardless; list the providers you actually want a button for explicitly instead.
{%- set icon_overrides = {} %}
{%- if cookiecutter.social_login_provider_icons.strip() %}
{%- for pair in cookiecutter.social_login_provider_icons.split(',') %}
{%- set key = pair.split('=')[0].strip() %}
{%- set value = pair.split('=', 1)[1].strip() %}
{%- set _ = icon_overrides.update({key: value}) %}
{%- endfor %}
{%- endif %}
{%- set entries = [] %}
{%- if cookiecutter.social_login_providers.strip() and cookiecutter.social_login_providers.strip() != "all" %}
{%- for provider in cookiecutter.social_login_providers.split(',') %}
{%- set provider_id = provider.strip() %}
{%- set icon = icon_overrides.get(provider_id, "").replace("'", "\\'") %}
{%- set _ = entries.append("{ id: '" ~ provider_id ~ "', name: '" ~ provider_id.replace("_", " ").title() ~ "', icon: '" ~ icon ~ "' }") %}
{%- endfor %}
{%- endif %}
{%- set prefix = "export const SOCIAL_PROVIDERS: SocialProvider[] = [" %}
{%- set one_line = prefix ~ entries|join(', ') ~ "]" %}

// icon: a static URL or local path (from social_login_provider_icons), used only when
// ProviderIcon has no bundled brand icon for this id - see components/app-auth/icons/brands.tsx.
// "" means no icon at all.
export type SocialProvider = { id: string; name: string; icon: string }

// Picks Prettier's own single- vs multi-line array layout at generation time (mirroring its
// printWidth rule) rather than always emitting one entry per line - a short provider list left
// multi-line in the raw output still fails `prettier --check` because Prettier would collapse it.
{%- if entries|length == 0 %}
export const SOCIAL_PROVIDERS: SocialProvider[] = []
{%- elif one_line|length <= 120 %}
{{ one_line }}
{%- else %}
export const SOCIAL_PROVIDERS: SocialProvider[] = [
{%- for entry in entries %}
  {{ entry }},
{%- endfor %}
]
{%- endif %}
