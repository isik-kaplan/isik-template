import { APPLE_ICON_SIZE, brandIcon } from '@/lib/brandIcon'

export const contentType = 'image/png'
export const size = { width: APPLE_ICON_SIZE, height: APPLE_ICON_SIZE }

export default function AppleIcon() {
  return brandIcon(APPLE_ICON_SIZE)
}
