import { CONFIG } from '@/config/public'
import { serverConfig } from '@/config/server'

/** What the web server's Sentry is given, read at runtime: setting the DSN is a restart, not a rebuild. */
export function serverSentryOptions() {
  const { DSN, TRACES_SAMPLE_RATE } = serverConfig().SENTRY
  return {
    dsn: DSN,
    tracesSampleRate: Number(TRACES_SAMPLE_RATE),
    // The header that joins this trace to the backend's goes only to this deployment's API, named from
    // config - never from a request's Host, which a visitor chooses.
    tracePropagationTargets: [new RegExp(`^https?://api\\.${CONFIG.DOMAIN.replaceAll('.', '\\.')}(:\\d+)?/`)],
  }
}
