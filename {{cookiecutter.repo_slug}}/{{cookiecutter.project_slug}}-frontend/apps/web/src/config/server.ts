import { config, string } from '@isikk/core/node'

// A prefix apart from public.ts's, so a server secret can't be read through the public accessor.
export const SERVER_CONFIG = config(
  {
    SENTRY: { DSN: string({ missingDefault: '' }) },
    // Shared with nginx to trust lib/visitor.ts's header; unset, every server fetch counts as the frontend's.
    FRONTEND_KEY: string({ missingDefault: '' }),
  },
  { prefix: '{{ cookiecutter.config_prefix }}_SERVER' }
)
