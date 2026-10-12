import { CONFIG } from '@/config/public'

// icon: a static URL or local path (from SOCIAL_LOGIN__ICONS), used only when ProviderIcon has no
// bundled brand icon for this id - see components/app-auth/icons/brands.tsx. "" means no icon at all.
export type SocialProvider = { id: string; name: string; icon: string }

// "openid_connect" reads "Openid Connect": the id is all there is to name a provider by, since the
// backend's provider list is configuration rather than something this app asks it for.
function nameOf(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// "<provider id>=<url or path>" pairs. A malformed one throws rather than quietly showing no icon.
function iconsOf(entries: string[]): Map<string, string> {
  const icons = new Map<string, string>()
  for (const entry of entries) {
    const separator = entry.indexOf('=')
    const id = entry.slice(0, separator).trim()
    const url = entry.slice(separator + 1).trim()
    if (separator === -1 || !id || !url) {
      throw new Error(`SOCIAL_LOGIN__ICONS entry ${JSON.stringify(entry)} is not <provider id>=<url or path>`)
    }
    icons.set(id, url)
  }
  return icons
}

// The same SOCIAL_LOGIN__PROVIDERS the backend installs its providers from, read per request
// through the public config - so a provider is added by setting the variable, never by a rebuild.
export function socialProviders(): SocialProvider[] {
  const icons = iconsOf(CONFIG.SOCIAL_LOGIN.ICONS)
  return CONFIG.SOCIAL_LOGIN.PROVIDERS.map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({ id, name: nameOf(id), icon: icons.get(id) ?? '' }))
}
