import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/base/drawer'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('Drawer', () => {
  // defaultOpen renders open at mount, with nothing awaited afterward - see tooltip.test.tsx.
  it('renders the header, footer, title and description when open, with their base styling', () => {
    render(
      <Drawer defaultOpen>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>My title</DrawerTitle>
            <DrawerDescription>My description</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>Footer</DrawerFooter>
        </DrawerContent>
      </Drawer>
    )

    expect(screen.getAllByText('My title').length).toBeGreaterThan(0)
    expect(screen.getAllByText('My description').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Footer').length).toBeGreaterThan(0)
    expect(screen.getByText('Open')).toBeTruthy()
    expect(document.querySelector('[data-slot="drawer-header"]')?.className).toContain('flex-col')
    expect(document.querySelector('[data-slot="drawer-footer"]')?.className).toContain('mt-auto')
    for (const title of screen.getAllByText('My title')) {
      expect(title.className).toContain('font-medium')
    }
    for (const description of screen.getAllByText('My description')) {
      expect(description.className).toContain('text-muted-foreground')
    }
  })

  it('merges an extra className onto the header, footer, title and description', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>
          <DrawerHeader className="header-class">
            <DrawerTitle className="title-class">My title</DrawerTitle>
            <DrawerDescription className="description-class">My description</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="footer-class">Footer</DrawerFooter>
        </DrawerContent>
      </Drawer>
    )

    for (const className of ['header-class', 'title-class', 'description-class', 'footer-class']) {
      expect(document.querySelector(`.${className}`)).toBeTruthy()
    }
  })

  it('is modal by default: renders an overlay, and makes the viewport interactive', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="drawer-viewport"]')?.getAttribute('data-modal')).toBe('true')
  })

  it('renders no overlay in non-modal mode', () => {
    render(
      <Drawer defaultOpen modal={false}>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull()
    expect(document.querySelector('[data-slot="drawer-viewport"]')?.getAttribute('data-modal')).toBe('false')
  })

  it('applies its base styling to the overlay and popup', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-overlay"]')?.className).toContain('bg-black/10')

    // The popup's className is built from several `cn()` arguments (base, nested, bleed, sizing,
    // stack, transitions, per-axis, per-direction) - one substring per section, so a single class
    // check per section actually exercises each literal instead of only the first.
    const popupClassName = document.querySelector('[data-slot="drawer-popup"]')?.className ?? ''
    for (const substring of [
      'bg-popover', // base
      'data-nested-drawer-open:overflow-hidden', // nested
      'after:pointer-events-none', // bleed
      '[--drawer-content-height:var(--drawer-height,auto)]', // sizing
      '[--stack-height:var(--drawer-frontmost-height,var(--drawer-height,0px))]', // stack
      'data-ending-style:transform-(--closed-transform)', // transitions
      'data-[swipe-axis=y]:inset-x-0', // axis: y
      'data-[swipe-axis=x]:inset-y-0', // axis: x
      'data-[swipe-direction=down]:bottom-0', // direction: down
      'data-[swipe-direction=up]:top-0', // direction: up
      'data-[swipe-direction=left]:left-0', // direction: left
      'data-[swipe-direction=right]:right-0', // direction: right
    ]) {
      expect(popupClassName).toContain(substring)
    }
  })

  it('shows no swipe handle by default', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-swipe-handle"]')).toBeNull()
  })

  it('shows a swipe handle when asked for one, with its base styling', () => {
    render(
      <Drawer defaultOpen showSwipeHandle>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    const handle = document.querySelector('[data-slot="drawer-swipe-handle"]')
    expect(handle).toBeTruthy()
    expect(handle?.className).toContain('cursor-grab')
  })

  it('marks no snap points on the popup or overlay when none are given', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.hasAttribute('data-snap-points')).toBe(false)
    expect(document.querySelector('[data-slot="drawer-overlay"]')?.hasAttribute('data-snap-points')).toBe(false)
  })

  it('marks snap points on the popup and overlay when given any', () => {
    render(
      <Drawer defaultOpen snapPoints={[0.5, 1]}>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-snap-points')).toBe('')
    expect(document.querySelector('[data-slot="drawer-overlay"]')?.getAttribute('data-snap-points')).toBe('')
  })

  it('does not mark snap points for an empty snapPoints array', () => {
    render(
      <Drawer defaultOpen snapPoints={[]}>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.hasAttribute('data-snap-points')).toBe(false)
  })

  it('defaults to swiping along the y axis (a "down" direction)', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-swipe-axis')).toBe('y')
  })

  it('swipes along the y axis for an explicit "up" direction too', () => {
    render(
      <Drawer defaultOpen swipeDirection="up">
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-swipe-axis')).toBe('y')
  })

  it('swipes along the x axis when the swipe direction is horizontal', () => {
    render(
      <Drawer defaultOpen swipeDirection="left">
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-swipe-axis')).toBe('x')
  })

  it('swipes along the x axis for the other horizontal direction too', () => {
    render(
      <Drawer defaultOpen swipeDirection="right">
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-swipe-axis')).toBe('x')
  })

  it('re-derives its context (modal, swipeDirection, ...) on a later prop change', () => {
    const { rerender } = render(
      <Drawer defaultOpen modal={false} swipeDirection="left">
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )
    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-swipe-axis')).toBe('x')
    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull()

    rerender(
      <Drawer defaultOpen modal swipeDirection="down">
        <DrawerContent>Content</DrawerContent>
      </Drawer>
    )

    expect(document.querySelector('[data-slot="drawer-popup"]')?.getAttribute('data-swipe-axis')).toBe('y')
    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeTruthy()
  })

  it('renders a close control', () => {
    render(
      <Drawer defaultOpen>
        <DrawerContent>
          <DrawerClose>Dismiss</DrawerClose>
        </DrawerContent>
      </Drawer>
    )

    expect(screen.getByText('Dismiss')).toBeTruthy()
  })

  it('requires DrawerContent to be used inside a Drawer', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<DrawerContent>Content</DrawerContent>)).toThrow('useDrawer must be used within a Drawer.')

    consoleError.mockRestore()
  })
})
