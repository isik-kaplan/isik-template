import { ICON_SIZES, brandIcon } from '@/lib/brandIcon'

export const contentType = 'image/png'

export function generateImageMetadata() {
  return ICON_SIZES.map((size) => ({ id: String(size), size: { width: size, height: size }, contentType }))
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return brandIcon(Number(await id))
}
