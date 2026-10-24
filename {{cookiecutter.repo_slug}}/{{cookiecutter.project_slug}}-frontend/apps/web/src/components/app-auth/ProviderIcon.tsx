import { BRAND_ICONS } from './icons/brands'

// A bundled brand icon wins; iconUrl (SOCIAL_LOGIN__ICONS) covers providers without one.
export function ProviderIcon({ providerId, name, iconUrl }: { providerId: string; name: string; iconUrl: string }) {
  const Icon = BRAND_ICONS[providerId]
  if (Icon) {
    return <Icon className="size-4" />
  }
  if (iconUrl) {
    // Not next/image: iconUrl is an arbitrary origin it would need allow-listed.
    // A real alt for the globals.css fallback, hidden from assistive tech: the name is beside it.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt={name} aria-hidden data-fallback="tile" className="size-4" />
  }
  return null
}
