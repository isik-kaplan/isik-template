import { BRAND_ICONS } from './icons/brands'

// A bundled brand icon always wins when one exists (crisp, no extra request); iconUrl - the
// generation-time value from social_login_provider_icons, see socialProviders.ts - only fills the
// gap for providers with no bundled icon, typically a deployment's own openid_connect/SAML IdP,
// which by definition has no single "brand" isik-template could ship for it.
export function ProviderIcon({ providerId, iconUrl }: { providerId: string; iconUrl: string }) {
  const Icon = BRAND_ICONS[providerId]
  if (Icon) {
    return <Icon className="size-4" />
  }
  if (iconUrl) {
    // next/image's optimizer needs every remote origin allow-listed ahead of time
    // (images.remotePatterns) - iconUrl is an arbitrary, per-deployment URL or local path, and a
    // 16px icon has no meaningful LCP/optimization benefit anyway.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" className="size-4" />
  }
  return null
}
