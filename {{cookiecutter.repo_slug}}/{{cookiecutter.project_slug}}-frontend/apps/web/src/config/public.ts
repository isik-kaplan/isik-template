import { publicConfig, string } from '@isikk/core/next/config'

// Resolved per-request, not baked at build time - one image serves every environment.
export const { CONFIG, PublicConfigScript } = publicConfig(
  {
    DOMAIN: string(),
  },
  { prefix: '{{ cookiecutter.config_prefix }}', globalKey: '__{{ cookiecutter.config_prefix }}_CONFIG__' }
)
