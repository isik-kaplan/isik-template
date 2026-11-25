import { CONFIG } from '@/config/public'

// id: what allauth calls it, an OpenID Connect issuer's own name. icon: from SOCIAL_LOGIN__ICONS, used when
// there is no bundled one; "" means none. adminOnly: offered for signing in on the admin's page alone.
export type SocialProvider = { id: string; name: string; icon: string; adminOnly: boolean }

// "openid_connect" reads "Openid Connect": the id is all there is to name it by.
function nameOf(id: string): string {
  return id
    .split(/[_-]/)
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

const listed = (entries: string[]) => entries.map((entry) => entry.trim()).filter(Boolean)

// The backend's SOCIAL_LOGIN__PROVIDERS, read per request, so adding one needs no rebuild. An OpenID Connect
// issuer is listed as openid_connect:<issuer>, and is that issuer to allauth.
export function socialProviders(): SocialProvider[] {
  const icons = iconsOf(CONFIG.SOCIAL_LOGIN.ICONS)
  const adminOnly = new Set(listed(CONFIG.SOCIAL_LOGIN.ADMIN_ONLY))
  const unlisted = [...adminOnly].filter((entry) => !listed(CONFIG.SOCIAL_LOGIN.PROVIDERS).includes(entry))
  if (unlisted.length > 0) {
    throw new Error(`SOCIAL_LOGIN__ADMIN_ONLY names what SOCIAL_LOGIN__PROVIDERS does not: ${unlisted.join(', ')}`)
  }
  return listed(CONFIG.SOCIAL_LOGIN.PROVIDERS).map((entry) => {
    const [provider, issuer] = entry.split(':')
    const id = issuer || provider
    return { id, name: nameOf(id), icon: icons.get(id) ?? '', adminOnly: adminOnly.has(entry) }
  })
}

/** The providers offered for signing in on this page: an admin-only one on the admin's alone. */
export function signInProviders(admin: boolean): SocialProvider[] {
  return socialProviders().filter((provider) => admin || !provider.adminOnly)
}
