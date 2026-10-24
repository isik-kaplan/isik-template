'use client'

import { createContext, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/base/drawer'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/base/popover'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

const PopoverClose = PopoverPrimitive.Close

// Literal classes: Tailwind's scanner cannot see a template string.
export type OverlayBreakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const DESKTOP_VISIBLE_CLASSES: Record<OverlayBreakpoint, string> = {
  sm: 'hidden sm:block',
  md: 'hidden md:block',
  lg: 'hidden lg:block',
  xl: 'hidden xl:block',
  '2xl': 'hidden 2xl:block',
}

const MOBILE_VISIBLE_CLASSES: Record<OverlayBreakpoint, string> = {
  sm: 'block sm:hidden',
  md: 'block md:hidden',
  lg: 'block lg:hidden',
  xl: 'block xl:hidden',
  '2xl': 'block 2xl:hidden',
}

type OverlayVariant = 'popover' | 'drawer'

const OverlayContext = createContext<OverlayVariant>('popover')

type OverlayProps = {
  breakpoint: OverlayBreakpoint
  swipeDirection?: React.ComponentProps<typeof Drawer>['swipeDirection']
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

// Both render, switched by CSS breakpoints: a media-query hook resolves after hydration and flashes.
export function Overlay({
  breakpoint,
  swipeDirection = 'down',
  open,
  defaultOpen,
  onOpenChange,
  children,
}: OverlayProps) {
  return (
    <>
      <div className={`${DESKTOP_VISIBLE_CLASSES[breakpoint]} h-full`}>
        <OverlayContext.Provider value="popover">
          <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            {children}
          </Popover>
        </OverlayContext.Provider>
      </div>
      <div className={`${MOBILE_VISIBLE_CLASSES[breakpoint]} h-full`}>
        <OverlayContext.Provider value="drawer">
          <Drawer swipeDirection={swipeDirection} open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            {children}
          </Drawer>
        </OverlayContext.Provider>
      </div>
    </>
  )
}

type OverlayTriggerProps = {
  children: ReactElement
}

export function OverlayTrigger({ children }: OverlayTriggerProps) {
  const variant = useContext(OverlayContext)

  if (variant === 'drawer') {
    return <DrawerTrigger render={children} />
  }

  return <PopoverTrigger render={children} />
}

type OverlayContentProps = {
  children: ReactNode
  className?: string
  // The Drawer's direction is set on the root; align/side/sideOffset are popover-only.
  side?: React.ComponentProps<typeof PopoverContent>['side']
  align?: React.ComponentProps<typeof PopoverContent>['align']
  alignOffset?: number
  sideOffset?: number
}

export function OverlayContent({ children, className, side, align, alignOffset, sideOffset }: OverlayContentProps) {
  const variant = useContext(OverlayContext)

  if (variant === 'drawer') {
    return <DrawerContent className={className}>{children}</DrawerContent>
  }

  return (
    <PopoverContent side={side} align={align} alignOffset={alignOffset} sideOffset={sideOffset} className={className}>
      {children}
    </PopoverContent>
  )
}

export function OverlayClose({ children }: { children: ReactNode }) {
  const variant = useContext(OverlayContext)

  if (variant === 'drawer') {
    return <DrawerClose>{children}</DrawerClose>
  }

  return <PopoverClose>{children}</PopoverClose>
}

export function OverlayTitle({ children, className }: { children: ReactNode; className?: string }) {
  const variant = useContext(OverlayContext)

  if (variant === 'drawer') {
    return <DrawerTitle className={className}>{children}</DrawerTitle>
  }

  return <PopoverTitle className={className}>{children}</PopoverTitle>
}

export function OverlayDescription({ children, className }: { children: ReactNode; className?: string }) {
  const variant = useContext(OverlayContext)

  if (variant === 'drawer') {
    return <DrawerDescription className={className}>{children}</DrawerDescription>
  }

  return <PopoverDescription className={className}>{children}</PopoverDescription>
}
