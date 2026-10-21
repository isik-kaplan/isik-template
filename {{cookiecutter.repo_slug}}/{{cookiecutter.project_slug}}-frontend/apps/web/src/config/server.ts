import { config, string } from '@isikk/core/node'

// Deliberately non-overlapping prefix from public.ts's - a server secret can't accidentally be
// read through the public config accessor.
export const SERVER_CONFIG = config(
  {
    SENTRY: { DSN: string({ missingDefault: '' }) },
    // Shared with nginx, which takes a fetch carrying it at its word about whose fetch it is - see
    // lib/visitor.ts. Unset, nginx counts every server-side fetch against the frontend instead.
    FRONTEND_KEY: string({ missingDefault: '' }),
  },
  { prefix: '{{ cookiecutter.config_prefix }}_SERVER' }
)
