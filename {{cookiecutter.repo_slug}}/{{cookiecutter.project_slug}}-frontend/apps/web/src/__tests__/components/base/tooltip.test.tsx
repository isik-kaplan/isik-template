import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/base/tooltip'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Tooltip', () => {
  // defaultOpen renders open at mount, with nothing awaited afterward - the known Base UI +
  // jsdom hang (see EmailsList.test.tsx) is specifically about awaiting something after a click.
  it('renders its content when open, with its base styling', () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent className="custom-class">Helpful text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    expect(screen.getAllByText('Helpful text').length).toBeGreaterThan(0)
    const popup = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
    expect(popup.className).toContain('bg-foreground')
    expect(popup.className).toContain('custom-class')
  })

  it('renders the trigger', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Helpful text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    expect(screen.getByText('Hover me')).toBeTruthy()
  })

  it('defaults to positioning the popup on top, center-aligned', () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Helpful text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const popup = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
    expect(popup.getAttribute('data-side')).toBe('top')
    expect(popup.getAttribute('data-align')).toBe('center')
  })

  it('takes a side/align override', () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent side="right" align="start">
            Helpful text
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const popup = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
    expect(popup.getAttribute('data-side')).toBe('right')
    expect(popup.getAttribute('data-align')).toBe('start')
  })
})
