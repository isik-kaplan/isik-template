import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
} from '@/components/base/dialog'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Dialog', () => {
  // defaultOpen renders open at mount, with nothing awaited afterward - see tooltip.test.tsx.
  it('renders its content, header and footer when open, with a default close button', () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My title</DialogTitle>
            <DialogDescription>My description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByText('My title')).toBeTruthy()
    expect(screen.getByText('My description')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
  })

  it('omits the default close button when told to', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogTitle>My title</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('applies its base styling to the overlay, popup, header, footer, title and description', () => {
    render(
      <Dialog defaultOpen>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My title</DialogTitle>
            <DialogDescription>My description</DialogDescription>
          </DialogHeader>
          <DialogFooter>Footer</DialogFooter>
        </DialogContent>
      </Dialog>
    )

    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('bg-black/50')
    expect(document.querySelector('[data-slot="dialog-content"]')?.className).toContain('rounded-none')
    expect(document.querySelector('[data-slot="dialog-header"]')?.className).toContain('text-left')
    expect(document.querySelector('[data-slot="dialog-footer"]')?.className).toContain('justify-end')
    expect(document.querySelector('[data-slot="dialog-title"]')?.className).toContain('font-semibold')
    expect(document.querySelector('[data-slot="dialog-description"]')?.className).toContain('text-muted-foreground')
  })

  it('merges an extra className onto each part', () => {
    render(
      <Dialog defaultOpen>
        <DialogOverlay className="overlay-class" />
        <DialogContent className="content-class">
          <DialogHeader className="header-class">
            <DialogTitle className="title-class">My title</DialogTitle>
            <DialogDescription className="description-class">My description</DialogDescription>
          </DialogHeader>
          <DialogFooter className="footer-class">Footer</DialogFooter>
        </DialogContent>
      </Dialog>
    )

    for (const className of [
      'overlay-class',
      'content-class',
      'header-class',
      'title-class',
      'description-class',
      'footer-class',
    ]) {
      expect(document.querySelector(`.${className}`)).toBeTruthy()
    }
  })
})
