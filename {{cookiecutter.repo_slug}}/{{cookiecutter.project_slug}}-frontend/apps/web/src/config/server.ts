import { config, string } from '@isikk/core/node'

const read = () =>
  config(
    {
      // The backend's rate, passed through by compose, so both halves of a trace are sampled or neither is.
      SENTRY: { DSN: string({ missingDefault: '' }), TRACES_SAMPLE_RATE: string({ missingDefault: '0' }) },
      // Shared with nginx to trust lib/visitor.ts's header; unset, every server fetch counts as the frontend's.
      FRONTEND_KEY: string({ missingDefault: '' }),
    },
    // A prefix apart from public.ts's, so a server secret can't be read through the public accessor.
    { prefix: '{{ cookiecutter.config_prefix }}_SERVER' }
  )

let resolved: ReturnType<typeof read> | undefined

// Read on first use, not at import: `next build` evaluates every server module with none of a
// deployment's environment present, so a required value read at module scope fails the build.
export const serverConfig = () => (resolved ??= read())
