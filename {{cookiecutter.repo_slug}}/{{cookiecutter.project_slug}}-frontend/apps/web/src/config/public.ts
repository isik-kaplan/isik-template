import { boolean, commaSeparatedList, publicConfig, string } from '@isikk/core/next/config'

// Resolved per-request, not baked at build time - one image serves every environment.
export const { CONFIG, PublicConfigScript } = publicConfig(
  {
    DOMAIN: string(),
    // The backend's OAUTH_PROVIDER__MODE: off, approval or auto.
    OAUTH_PROVIDER: { MODE: string({ missingDefault: 'off' }) },
    SOCIAL_LOGIN: {
      PROVIDERS: commaSeparatedList({ missingDefault: [] }),
      ICONS: commaSeparatedList({ missingDefault: [] }),
      // Nobody signs in here with a password; a superuser still does, in the admin.
      ONLY: boolean({ missingDefault: {{ cookiecutter.social_login_only|lower }} }),
    },
  },
  { prefix: '{{ cookiecutter.config_prefix }}', globalKey: '__{{ cookiecutter.config_prefix }}_CONFIG__' }
)
