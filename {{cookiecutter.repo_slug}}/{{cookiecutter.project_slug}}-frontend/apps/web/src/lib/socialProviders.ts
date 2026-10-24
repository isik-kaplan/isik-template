import { CONFIG } from '@/config/public'

// icon: from SOCIAL_LOGIN__ICONS, used when there is no bundled one; "" means none.
export type SocialProvider = { id: string; name: string; icon: string }

// "openid_connect" reads "Openid Connect": the id is all there is to name it by.
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

// The backend's SOCIAL_LOGIN__PROVIDERS, read per request, so adding one needs no rebuild.
export function socialProviders(): SocialProvider[] {
  const icons = iconsOf(CONFIG.SOCIAL_LOGIN.ICONS)
  return CONFIG.SOCIAL_LOGIN.PROVIDERS.map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({ id, name: nameOf(id), icon: icons.get(id) ?? '' }))
}
