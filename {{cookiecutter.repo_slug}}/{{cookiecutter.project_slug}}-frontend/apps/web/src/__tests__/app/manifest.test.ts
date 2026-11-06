import manifest from '@/app/manifest'

import brand from '@{{ cookiecutter.repo_slug }}/brand/brand.json'

import { describe, expect, it } from 'vitest'

describe('manifest', () => {
  it('describes the app for installability', () => {
    const result = manifest()

    expect(result.name).toBe(brand.name)
    expect(result.short_name).toBe(brand.name)
    expect(result.start_url).toBe('/')
    expect(result.display).toBe('standalone')
    expect(result.background_color).toBe('#ffffff')
    expect(result.theme_color).toBe('#ffffff')
  })

  it('lists the two icons a browser asks for before it offers to install', () => {
    expect(manifest().icons).toEqual([
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ])
  })
})
