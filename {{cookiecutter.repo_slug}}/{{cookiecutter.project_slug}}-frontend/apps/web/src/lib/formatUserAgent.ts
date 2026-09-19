// Token matching rather than a UA-parsing dependency: this only has to answer "is that me?", and
// it degrades to the raw string when it cannot tell.

// Order matters throughout - Edge and Opera both carry "Chrome", and Chrome carries "Safari".
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\b(?:CriOS|Chrome)\//, 'Chrome'],
  [/\b(?:FxiOS|Firefox)\//, 'Firefox'],
  [/\bSafari\//, 'Safari'],
  [/\bcurl\//, 'curl'],
]

const PLATFORMS: [RegExp, string][] = [
  [/\bWindows NT\b/, 'Windows'],
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

function firstMatch(candidates: [RegExp, string][], userAgent: string): string | null {
  return candidates.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

export type FormattedUserAgent = {
  name: string | null
  /** Kept for the title attribute - the parse is a guess, so hiding the original would be worse. */
  raw: string
}

export function formatUserAgent(userAgent: string): FormattedUserAgent {
  const raw = userAgent.trim()
  if (!raw) {
    return { name: null, raw }
  }

  const browser = firstMatch(BROWSERS, raw)
  const platform = firstMatch(PLATFORMS, raw)

  if (browser && platform) {
    return { name: `${browser} on ${platform}`, raw }
  }
  if (browser ?? platform) {
    return { name: (browser ?? platform) as string, raw }
  }
  // A script or a client we have no token for - show it, trimmed to something that fits a row.
  return { name: raw.length > 40 ? `${raw.slice(0, 40)}…` : raw, raw }
}
