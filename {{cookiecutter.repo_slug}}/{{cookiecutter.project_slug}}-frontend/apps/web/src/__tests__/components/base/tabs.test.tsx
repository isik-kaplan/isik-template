import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/base/tabs'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Tabs', () => {
  it('defaults to horizontal orientation', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    expect(container.querySelector('[data-slot="tabs"]')?.getAttribute('data-orientation')).toBe('horizontal')
    expect(screen.getByText('Content A')).toBeTruthy()
  })

  it('takes a vertical orientation', () => {
    const { container } = render(
      <Tabs defaultValue="a" orientation="vertical">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    expect(container.querySelector('[data-slot="tabs"]')?.getAttribute('data-orientation')).toBe('vertical')
  })

  it('merges an extra className onto the root, alongside its base styling', () => {
    const { container } = render(
      <Tabs defaultValue="a" className="custom-class">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    const root = container.querySelector('[data-slot="tabs"]') as HTMLElement
    expect(root.className).toContain('custom-class')
    expect(root.className).toContain('flex')
  })

  it('applies its base styling to the list, trigger and content, and merges extra classNames', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList className="list-class">
          <TabsTrigger value="a" className="trigger-class">
            A
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="content-class">
          Content A
        </TabsContent>
      </Tabs>
    )

    const list = container.querySelector('[data-slot="tabs-list"]') as HTMLElement
    expect(list.className).toContain('bg-muted')
    expect(list.className).toContain('list-class')

    const trigger = container.querySelector('[data-slot="tabs-trigger"]') as HTMLElement
    expect(trigger.className).toContain('rounded-none')
    expect(trigger.className).toContain('trigger-class')

    const content = container.querySelector('[data-slot="tabs-content"]') as HTMLElement
    expect(content.className).toContain('outline-none')
    expect(content.className).toContain('content-class')
  })
})
