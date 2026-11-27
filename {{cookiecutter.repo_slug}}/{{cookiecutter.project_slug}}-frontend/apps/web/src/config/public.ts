import { boolean, caster, commaSeparatedList, publicConfig, string } from '@isikk/core/next/config'

export const NAME_REQUIREMENTS = [
  'username_with_optional_full',
  'full_only',
  'full_and_username',
  'full_with_optional_username',
  'username_only',
] as const

export type NameRequirement = (typeof NAME_REQUIREMENTS)[number]

// Throws on anything else, so a mistyped value fails the request that reads it, not a later form.
const nameRequirement = caster((value: string): NameRequirement => {
  if (!(NAME_REQUIREMENTS as readonly string[]).includes(value)) {
    throw new Error(
      `ACCOUNTS__NAME_REQUIREMENT is ${JSON.stringify(value)}; it is one of ${NAME_REQUIREMENTS.join(', ')}`
    )
  }
  return value as NameRequirement
})

// Resolved per-request, not baked at build time - one image serves every environment.
export const { CONFIG, PublicConfigScript } = publicConfig(
  {
    DOMAIN: string(),
    ACCOUNTS: { NAME_REQUIREMENT: nameRequirement({ missingDefault: '{{ cookiecutter.name_requirement }}' }) },
    // The backend's OAUTH_PROVIDER__MODE: off, approval or auto.
    OAUTH_PROVIDER: { MODE: string({ missingDefault: 'off' }) },
    SOCIAL_LOGIN: {
      PROVIDERS: commaSeparatedList({ missingDefault: [] }),
      ICONS: commaSeparatedList({ missingDefault: [] }),
      // Of PROVIDERS, those whose button shows only on the admin's sign-in page. The backend never reads it.
      ADMIN_ONLY: commaSeparatedList({ missingDefault: [] }),
      // Nobody signs in here with a password; a superuser still does, in the admin.
      ONLY: boolean({ missingDefault: {{ cookiecutter.social_login_only|lower }} }),
    },
  },
  { prefix: '{{ cookiecutter.config_prefix }}', globalKey: '__{{ cookiecutter.config_prefix }}_CONFIG__' }
)
