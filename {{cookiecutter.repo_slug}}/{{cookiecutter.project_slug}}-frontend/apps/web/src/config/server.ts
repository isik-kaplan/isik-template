import { config, string } from '@isikk/core/node'

// Deliberately non-overlapping prefix from public.ts's - a server secret can't accidentally be
// read through the public config accessor.
export const SERVER_CONFIG = config(
  {
    SENTRY: { DSN: string({ missingDefault: '' }) },
  },
  { prefix: '{{ cookiecutter.config_prefix }}_SERVER' }
)
