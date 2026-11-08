import { Editor } from '@/components/app/Editor'
import { LoadingOverlay } from '@/components/app/LoadingOverlay'
import { Markdown } from '@/components/app/Markdown'
import {
  Overlay,
  OverlayClose,
  OverlayContent,
  OverlayDescription,
  OverlayTitle,
  OverlayTrigger,
} from '@/components/app/Overlay'
import { Paginator } from '@/components/app/Paginator'
import { SessionWatcher } from '@/components/app/SessionWatcher'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/base/avatar'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/base/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/base/dialog'
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/base/popover'
import { Skeleton } from '@/components/base/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/base/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/base/tooltip'

import { words } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { ThemeProvider } from 'next-themes'
import { describe, expect } from 'vitest'

const settle = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

describe('an overlay', () => {
  test.prop([words, words, fc.constantFrom(...(['sm', 'md', 'lg', 'xl', '2xl'] as const))])(
    'opens its content from its trigger, as a popover and as a drawer at once, and closes it again',
    async (title, body, breakpoint) => {
      freshDom()
      render(
        <Overlay breakpoint={breakpoint}>
          <OverlayTrigger>
            <button type="button">Open</button>
          </OverlayTrigger>
          <OverlayContent>
            <OverlayTitle>{title}</OverlayTitle>
            <OverlayDescription>{body}</OverlayDescription>
            <OverlayClose>
              <button type="button">Close</button>
            </OverlayClose>
          </OverlayContent>
        </Overlay>
      )
      // Both variants are in the document; a stylesheet would hide one, and jsdom applies none.
      const [popover, drawer] = screen.getAllByRole('button', { name: 'Open' })
      expect(drawer).toBeTruthy()
      fireEvent.click(popover)
      await settle()
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
      await settle(20)
      fireEvent.click(drawer)
      await settle()
      expect(screen.getAllByText(body).length).toBeGreaterThan(0)
    }
  )
})

describe('the dialog, drawer, popover and tooltip', () => {
  test.prop([words, words, fc.boolean()])(
    'show their parts while open and none while shut',
    async (title, body, open) => {
      freshDom()
      render(
        <TooltipProvider>
          <Dialog open={open}>
            <DialogTrigger>dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{`${title} d`}</DialogTitle>
                <DialogDescription>{`${body} d`}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose>shut</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Drawer open={open}>
            <DrawerTrigger>drawer</DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{`${title} r`}</DrawerTitle>
                <DrawerDescription>{`${body} r`}</DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <DrawerClose>shut</DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          <Popover open={open}>
            <PopoverTrigger>popover</PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>{`${title} p`}</PopoverTitle>
                <PopoverDescription>{`${body} p`}</PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
          <Tooltip open={open}>
            <TooltipTrigger>tooltip</TooltipTrigger>
            <TooltipContent>{`${title} t`}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
      await settle()
      for (const suffix of ['d', 'r', 'p', 't'])
        expect(screen.queryAllByText(`${title} ${suffix}`).length > 0).toBe(open)
      for (const suffix of ['d', 'r', 'p']) expect(screen.queryAllByText(`${body} ${suffix}`).length > 0).toBe(open)
    }
  )
})

describe('tabs', () => {
  test.prop([
    fc.uniqueArray(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 2, maxLength: 4 }),
    fc.nat(),
    fc.constantFrom(...(['horizontal', 'vertical'] as const)),
  ])('show the panel of the tab chosen, and only it', async (names, pick, orientation) => {
    freshDom()
    const chosen = names[pick % names.length]
    render(
      <Tabs defaultValue={names[0]} orientation={orientation}>
        <TabsList>
          {names.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
        {names.map((name) => (
          <TabsContent key={name} value={name}>{`panel ${name}`}</TabsContent>
        ))}
      </Tabs>
    )
    fireEvent.click(screen.getByRole('tab', { name: chosen }))
    await settle()
    expect(screen.getByRole('tab', { name: chosen }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(`panel ${chosen}`)).toBeTruthy()
  })
})

describe('cards, avatars and placeholders', () => {
  test.prop([words, words, fc.stringMatching(/^[A-Z]{1,2}$/), fc.constantFrom(...(['sm', 'default', 'lg'] as const))])(
    'hold whatever they are given',
    (title, body, initials, size) => {
      freshDom()
      render(
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{body}</CardDescription>
            <CardAction>act</CardAction>
          </CardHeader>
          <CardContent>
            <Avatar size={size}>
              <AvatarImage src="" alt="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <Skeleton data-testid="skeleton" />
          </CardContent>
          <CardFooter>end</CardFooter>
        </Card>
      )
      expect(screen.getByText(title)).toBeTruthy()
      expect(screen.getByText(body)).toBeTruthy()
      expect(screen.getByText(initials)).toBeTruthy()
      expect(screen.getByTestId('skeleton')).toBeTruthy()
    }
  )
})

describe('a loading overlay', () => {
  test.prop([fc.boolean(), fc.boolean(), fc.option(words, { nil: undefined })])(
    'keeps its children mounted, shutting them away while loading or disabled, and says why when disabled',
    (loading, disabled, message) => {
      freshDom()
      const { container } = render(
        <LoadingOverlay loading={loading} disabled={disabled} message={message}>
          <p>content</p>
        </LoadingOverlay>
      )
      expect(screen.getByText('content')).toBeTruthy()
      const shut = loading || disabled
      expect(container.querySelector('[aria-hidden="true"]') !== null).toBe(shut)
      expect(message !== undefined && screen.queryByText(message) !== null).toBe(Boolean(message) && shut && !loading)
    }
  )
})

describe('markdown and the editor', () => {
  test.prop([words, fc.array(words, { minLength: 1, maxLength: 3 })])(
    'render a heading and a list as such',
    (heading, items) => {
      freshDom()
      render(<Markdown>{`# ${heading}\n\n${items.map((item) => `- ${item}`).join('\n')}`}</Markdown>)
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(items)
    }
  )

  test.prop([words, fc.boolean()])('shows the content it was given, editable or not', async (text, editable) => {
    freshDom()
    const { container } = render(<Editor content={`<p>${text}</p>`} editable={editable} />)
    await settle(10)
    const surface = container.querySelector('[contenteditable]')
    expect(surface?.getAttribute('contenteditable')).toBe(String(editable))
    expect(surface?.textContent).toBe(text)
  })
})

describe('the paginator', () => {
  // The ends drawn on their own: one page in twenty is the first, and either is the end that has no link.
  test.prop([
    fc.oneof(fc.integer({ min: 0, max: 1 }), fc.integer({ min: 2, max: 20 })),
    fc.oneof(fc.constant(1), fc.constant(20), fc.integer({ min: 1, max: 20 })),
    fc.dictionary(fc.stringMatching(/^[a-z]{1,5}$/), fc.stringMatching(/^[a-z0-9]{1,5}$/), { maxKeys: 2 }),
  ])(
    'links the pages either side that exist, keeping the query, and is nothing for one page',
    async (total, at, query) => {
      freshDom()
      const page = Math.min(at, Math.max(total, 1))
      const node = await Paginator({ queryParams: query, currentPage: page, totalPages: total })
      if (total <= 1) {
        expect(node).toBeNull()
        return
      }
      render(node as React.ReactElement)
      const previous = screen.getByLabelText('Previous page')
      const next = screen.getByLabelText('Next page')
      expect(previous.tagName === 'A').toBe(page > 1)
      expect(next.tagName === 'A').toBe(page < total)
      if (page < total) {
        const href = new URL(next.getAttribute('href') as string, 'http://x')
        expect(href.searchParams.get('page')).toBe(String(page + 1))
        for (const [key, value] of Object.entries(query))
          if (key !== 'page') expect(href.searchParams.get(key)).toBe(value)
      }
    }
  )
})

describe('the session watcher', () => {
  test.prop([fc.array(fc.constantFrom('visible', 'hidden'), { maxLength: 4 })])(
    'checks the session again whenever the tab comes back into view',
    (changes) => {
      freshDom()
      render(<SessionWatcher />)
      for (const state of changes) {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
        document.dispatchEvent(new Event('visibilitychange'))
      }
      expect(navigation.refresh).toHaveBeenCalledTimes(changes.filter((state) => state === 'visible').length)
    }
  )

  test('leaves for login when another tab says the session died', async () => {
    freshDom()
    Object.defineProperty(window, 'location', { configurable: true, value: { href: 'http://test-project.test/here' } })
    render(<SessionWatcher />)
    const otherTab = new BroadcastChannel('{{ cookiecutter.project_slug }}-session')
    otherTab.postMessage('session-cleared')
    await settle(30)
    otherTab.close()
    expect(window.location.href).toBe('/auth/login')
  })
})

describe('the theme switch', () => {
  test.prop([fc.constantFrom('light', 'dark')])('offers the other theme, and switches to it', async (start) => {
    freshDom()
    // next-themes keeps the choice, so the example before this one's would win over its default.
    localStorage.clear()
    render(
      <ThemeProvider attribute="class" defaultTheme={start} enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>
    )
    await settle()
    const other = start === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
    fireEvent.click(screen.getByRole('button', { name: other }))
    await settle()
    expect(
      screen.getByRole('button', { name: start === 'dark' ? 'Switch to dark theme' : 'Switch to light theme' })
    ).toBeTruthy()
  })
})
