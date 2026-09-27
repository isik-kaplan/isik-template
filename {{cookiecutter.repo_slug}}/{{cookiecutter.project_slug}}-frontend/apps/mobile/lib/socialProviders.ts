{#- A native app has no OAuth redirect to follow (see AppAuthApi.loginWithProviderToken's own
   comment) - only providers with an actual on-device sign-in SDK can work here at all, unlike
   the web app's SOCIAL_PROVIDERS list, which works for any allauth-configured provider via
   redirect. "all" is resolved the same conservative way: only google/apple ever turn on, never
   the rest of allauth's catalog. #}
{%- set providers = cookiecutter.social_login_providers.split(',') | map('trim') | list %}
{%- set all_enabled = cookiecutter.social_login_providers.strip() == 'all' -%}

// Whether this project's backend actually has each provider configured (cookiecutter's own
// social_login_providers answer) - not just whether the native SDK dependency is installed, since
// both packages are always in package.json regardless (there's no include_mobile-style flag for
// individual providers, and neither button renders when its own flag here is off anyway).
export const GOOGLE_SIGN_IN_ENABLED = {{ 'true' if all_enabled or 'google' in providers else 'false' }}
export const APPLE_SIGN_IN_ENABLED = {{ 'true' if all_enabled or 'apple' in providers else 'false' }}
