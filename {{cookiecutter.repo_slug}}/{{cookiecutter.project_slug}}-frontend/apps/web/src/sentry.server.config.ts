import { serverSentryOptions } from '@/lib/sentry'

import * as Sentry from '@sentry/nextjs'

Sentry.init(serverSentryOptions())
