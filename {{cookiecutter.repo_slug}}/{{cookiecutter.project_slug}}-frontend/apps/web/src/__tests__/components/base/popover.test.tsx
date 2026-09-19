import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/base/popover'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Popover', () => {
  // defaultOpen renders open at mount, with nothing awaited afterward - see tooltip.test.tsx.
  it("renders the trigger and content, with the content's base styling, when open", () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent className="custom-class">
          <PopoverHeader>
            <PopoverTitle>My title</PopoverTitle>
            <PopoverDescription>My description</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    )

    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('My title')).toBeTruthy()
    expect(screen.getByText('My description')).toBeTruthy()
    const popup = document.querySelector('[data-slot="popover-content"]') as HTMLElement
    expect(popup.className).toContain('bg-popover')
    expect(popup.className).toContain('custom-class')
  })

  it('defaults to positioning the content below the trigger, center-aligned', () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    )

    const popup = document.querySelector('[data-slot="popover-content"]') as HTMLElement
    expect(popup.getAttribute('data-side')).toBe('bottom')
    expect(popup.getAttribute('data-align')).toBe('center')
  })

  it('takes a side/align override', () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent side="left" align="start">
          Content
        </PopoverContent>
      </Popover>
    )

    const popup = document.querySelector('[data-slot="popover-content"]') as HTMLElement
    expect(popup.getAttribute('data-side')).toBe('left')
    expect(popup.getAttribute('data-align')).toBe('start')
  })

  it('applies base styling to the title and description, and merges extra classNames', () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle className="title-class">My title</PopoverTitle>
          <PopoverDescription className="description-class">My description</PopoverDescription>
        </PopoverContent>
      </Popover>
    )

    const title = screen.getByText('My title')
    expect(title.className).toContain('font-medium')
    expect(title.className).toContain('title-class')

    const description = screen.getByText('My description')
    expect(description.className).toContain('text-muted-foreground')
    expect(description.className).toContain('description-class')
  })
})

describe('PopoverHeader', () => {
  it('renders its children', () => {
    render(<PopoverHeader>Header content</PopoverHeader>)

    expect(screen.getByText('Header content')).toBeTruthy()
  })

  it('applies its base styling and merges an extra className', () => {
    const { container } = render(<PopoverHeader className="custom-class">Header content</PopoverHeader>)

    const header = container.querySelector('.custom-class') as HTMLElement
    expect(header).toBeTruthy()
    expect(header.className).toContain('flex-col')
  })
})
