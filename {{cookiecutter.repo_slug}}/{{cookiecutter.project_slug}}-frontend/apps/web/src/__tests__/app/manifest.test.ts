import manifest from '@/app/manifest'

import { describe, expect, it } from 'vitest'

describe('manifest', () => {
  it('describes the app for installability', () => {
    const result = manifest()

    expect(result.name).toBe('{{ cookiecutter.project_name }}')
    expect(result.short_name).toBe('{{ cookiecutter.project_name }}')
    expect(result.start_url).toBe('/')
    expect(result.display).toBe('standalone')
    expect(result.background_color).toBe('#ffffff')
    expect(result.theme_color).toBe('#ffffff')
    expect(result.icons).toEqual([])
  })
})
