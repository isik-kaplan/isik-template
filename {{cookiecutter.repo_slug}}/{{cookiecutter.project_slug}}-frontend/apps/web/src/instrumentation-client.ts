import * as Sentry from '@sentry/nextjs'

// Build-time, both: this runs before React renders, so it can't read the config the layout injects. Off
// unless set, like the server's rate, so a trace is sampled on both sides or neither.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
