import AppleIcon, { contentType as appleContentType, size as appleSize } from '@/app/apple-icon'
import Icon, { contentType, generateImageMetadata } from '@/app/icon'

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Found through the package rather than the working directory, which Stryker's sandbox moves.
const SOURCE = createRequire(import.meta.url).resolve('@{{ cookiecutter.repo_slug }}/brand/icon.png')

vi.mock('node:fs/promises', async (actual) => {
  const real = await actual<typeof import('node:fs/promises')>()
  return { ...real, default: real, readFile: vi.fn() }
})

// A PNG's width and height sit at a fixed offset in its header chunk.
async function dimensions(response: Response) {
  const bytes = new DataView(await response.arrayBuffer())
  return [bytes.getUint32(16), bytes.getUint32(20)]
}

describe('icons', () => {
  beforeEach(async () => {
    const { readFile: realReadFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(readFile)
      .mockReset()
      .mockResolvedValue(await realReadFile(SOURCE))
  })

  it('offers a tab icon and the two sizes a browser installs from', () => {
    expect(contentType).toBe('image/png')
    expect(generateImageMetadata()).toEqual(
      [32, 192, 512].map((size) => ({
        id: String(size),
        size: { width: size, height: size },
        contentType: 'image/png',
      }))
    )
  })

  it('draws each size from the one source image in the brand package', async () => {
    const response = await Icon({ id: Promise.resolve('192') })

    expect(readFile).toHaveBeenCalledWith(path.join(process.cwd(), '..', '..', 'packages', 'brand', 'icon.png'))
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await dimensions(response)).toEqual([192, 192])
  })

  it('draws the home-screen icon iOS asks for at 180', async () => {
    expect(appleContentType).toBe('image/png')
    expect(appleSize).toEqual({ width: 180, height: 180 })
    expect(await dimensions(await AppleIcon())).toEqual([180, 180])
  })
})
