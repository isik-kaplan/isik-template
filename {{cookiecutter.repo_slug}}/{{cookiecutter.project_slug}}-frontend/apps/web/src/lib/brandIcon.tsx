import { ImageResponse } from 'next/og'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

// The one source image; every size here is drawn from it, so changing the icon is replacing that file.
export const BRAND_ICON = path.join('..', '..', 'packages', 'brand', 'icon.png')

export const ICON_SIZES = [32, 192, 512]
export const APPLE_ICON_SIZE = 180

export async function brandIcon(size: number): Promise<ImageResponse> {
  const source = await readFile(path.join(process.cwd(), BRAND_ICON))
  const src = `data:image/png;base64,${source.toString('base64')}`
  // eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, never rendered as a page.
  return new ImageResponse(<img src={src} width={size} height={size} alt="" />, { width: size, height: size })
}
