import { SOCIAL_PROVIDERS } from '@/lib/socialProviders'

import { describe, expect, it } from 'vitest'

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
{%- set _ = entries.append("      { id: '" ~ provider_id ~ "', name: '" ~ provider_id.replace("_", " ").title() ~ "', icon: '" ~ icon ~ "' },") %}
{%- endfor %}
{%- endif %}

// Rebuilt from the same social_login_providers/social_login_provider_icons cookiecutter answers
// socialProviders.ts itself was generated from - both are frozen at bake time, so this is a real
// independent expected value, not a tautology against the module under test.
describe('SOCIAL_PROVIDERS', () => {
  it('lists exactly the providers this project was generated with', () => {
    expect(SOCIAL_PROVIDERS).toEqual([
{%- for entry in entries %}
{{ entry }}
{%- endfor %}
    ])
  })
})
