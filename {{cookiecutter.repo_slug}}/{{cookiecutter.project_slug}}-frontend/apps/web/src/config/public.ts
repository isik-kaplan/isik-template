import { commaSeparatedList, publicConfig, string } from '@isikk/core/next/config'

// Resolved per-request, not baked at build time - one image serves every environment.
export const { CONFIG, PublicConfigScript } = publicConfig(
  {
    DOMAIN: string(),
    // off, internal or public - the backend's own OAUTH_PROVIDER__MODE, deciding whether the profile
    // shows the applications tab at all.
    OAUTH_PROVIDER: { MODE: string({ missingDefault: 'off' }) },
    SOCIAL_LOGIN: {
      PROVIDERS: commaSeparatedList({ missingDefault: [] }),
      ICONS: commaSeparatedList({ missingDefault: [] }),
    },
  },
  { prefix: '{{ cookiecutter.config_prefix }}', globalKey: '__{{ cookiecutter.config_prefix }}_CONFIG__' }
)
