import type { NextConfig } from 'next'

import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  // Read at request time by path, which the standalone build's tracing cannot follow on its own.
  outputFileTracingIncludes: { '/legal/[doc]': ['./src/legal/**/*.md'] },
}

export default nextConfig
