import {
  Overlay,
  OverlayClose,
  OverlayContent,
  OverlayDescription,
  OverlayTitle,
  OverlayTrigger,
} from '@/components/app/Overlay'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Overlay', () => {
  it.each([
    ['sm', 'hidden sm:block', 'block sm:hidden'],
    ['md', 'hidden md:block', 'block md:hidden'],
    ['lg', 'hidden lg:block', 'block lg:hidden'],
    ['xl', 'hidden xl:block', 'block xl:hidden'],
    ['2xl', 'hidden 2xl:block', 'block 2xl:hidden'],
  ] as const)(
    'applies the matching desktop/mobile visibility classes for breakpoint=%s',
    (breakpoint, desktopClass, mobileClass) => {
      const { container } = render(
        <Overlay breakpoint={breakpoint}>
          <OverlayTrigger>
            <button>Open</button>
          </OverlayTrigger>
          <OverlayContent>content</OverlayContent>
        </Overlay>
      )

      const [desktopWrapper, mobileWrapper] = container.querySelectorAll(':scope > div')
      expect(desktopWrapper.className).toBe(`${desktopClass} h-full`)
      expect(mobileWrapper.className).toBe(`${mobileClass} h-full`)
    }
  )

  it('defaults the drawer\'s swipe direction to "down"', () => {
    render(
      <Overlay breakpoint="md" defaultOpen>
        <OverlayTrigger>
          <button>Open</button>
        </OverlayTrigger>
        <OverlayContent>content</OverlayContent>
      </Overlay>
    )

    expect(document.querySelector('[data-swipe-direction]')?.getAttribute('data-swipe-direction')).toBe('down')
  })

  it('renders both a desktop trigger and a mobile trigger for the same children', () => {
    render(
      <Overlay breakpoint="md">
        <OverlayTrigger>
          <button>Open</button>
        </OverlayTrigger>
        <OverlayContent>content</OverlayContent>
      </Overlay>
    )

    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(2)
  })

  // defaultOpen renders both panes open at mount, with no click and nothing awaited afterward -
  // interacting with an open Popover and then awaiting anything hangs under jsdom (see
  // EmailsList.test.tsx); a static already-open render doesn't hit that path.
  it('renders the drawer content, title, description and close control on the mobile pane', () => {
    render(
      <Overlay breakpoint="md" defaultOpen>
        <OverlayTrigger>
          <button>Open</button>
        </OverlayTrigger>
        <OverlayContent>
          <OverlayTitle>My title</OverlayTitle>
          <OverlayDescription>My description</OverlayDescription>
          <OverlayClose>Close</OverlayClose>
        </OverlayContent>
      </Overlay>
    )

    expect(screen.getAllByText('My title').length).toBeGreaterThan(0)
    expect(screen.getAllByText('My description').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Close').length).toBeGreaterThan(0)
  })
})
