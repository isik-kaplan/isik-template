import { Avatar, AvatarFallback, AvatarImage } from '@/components/base/avatar'

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom never fires a real <img> load event, so Base UI's Avatar.Image never becomes visible
// without help - stubbing window.Image to resolve on the next microtask (like a cached image
// would) lets a real test reach it instead of only proving the component mounts.
class ResolvingImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 1
  complete = false
  set src(_value: string) {
    queueMicrotask(() => {
      this.complete = true
      this.onload?.()
    })
  }
}

describe('Avatar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a fallback', () => {
    render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    )

    expect(screen.getByText('JD')).toBeTruthy()
  })

  it('applies its base fallback styling and merges an extra className', () => {
    render(
      <Avatar>
        <AvatarFallback className="custom-class">JD</AvatarFallback>
      </Avatar>
    )

    const fallback = screen.getByText('JD')
    expect(fallback.className).toContain('bg-muted')
    expect(fallback.className).toContain('custom-class')
  })

  it('applies its base root styling and merges an extra className', () => {
    const { container } = render(
      <Avatar className="custom-class">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    )

    const root = container.querySelector('[data-slot="avatar"]') as HTMLElement
    expect(root.className).toContain('rounded-none')
    expect(root.className).toContain('custom-class')
  })

  it('defaults to the default size', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    )

    expect(container.querySelector('[data-slot="avatar"]')?.getAttribute('data-size')).toBe('default')
  })

  it('takes a size override', () => {
    const { container } = render(
      <Avatar size="lg">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    )

    expect(container.querySelector('[data-slot="avatar"]')?.getAttribute('data-size')).toBe('lg')
  })

  it('merges an extra className', () => {
    const { container } = render(
      <Avatar className="custom-class">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    )

    expect(container.querySelector('.custom-class')).toBeTruthy()
  })

  it('renders the image, with its own base styling, once it loads', async () => {
    vi.stubGlobal('Image', ResolvingImage)
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.test/avatar.png" alt="Jane's avatar" className="custom-class" />
      </Avatar>
    )

    const img = await waitFor(() => {
      const el = container.querySelector('img')
      expect(el).toBeTruthy()
      return el as HTMLImageElement
    })
    expect(img.className).toContain('object-cover')
    expect(img.className).toContain('custom-class')
  })

  // Base UI's Avatar.Image renders nothing until the image's load status resolves - without the
  // stub above, that never happens under jsdom. This only proves the component mounts without
  // throwing while unresolved, which the real test above doesn't otherwise cover.
  it('mounts an image without throwing', () => {
    expect(() =>
      render(
        <Avatar>
          <AvatarImage src="https://example.test/avatar.png" alt="Jane's avatar" />
        </Avatar>
      )
    ).not.toThrow()
  })
})
