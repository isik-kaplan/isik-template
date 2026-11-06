import type { MetadataRoute } from 'next'

import { ICON_SIZES } from '@/lib/brandIcon'

import brand from '@{{ cookiecutter.repo_slug }}/brand/brand.json'

// Independent of the backend, which is why the Docker healthcheck hits this instead of "/".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    // A browser offers to install only with a 192 and a 512; the 32 is the tab's.
    icons: ICON_SIZES.filter((size) => size >= 192).map((size) => ({
      src: `/icon/${size}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
    })),
  }
}
