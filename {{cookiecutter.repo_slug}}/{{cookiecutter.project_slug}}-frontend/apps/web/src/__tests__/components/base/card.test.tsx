import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/base/card'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Card', () => {
  it('renders every part', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )

    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText('Description')).toBeTruthy()
    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
    expect(screen.getByText('Footer')).toBeTruthy()
  })

  it('merges an extra className onto each part', () => {
    render(
      <Card className="card-class">
        <CardHeader className="header-class">
          <CardTitle className="title-class">Title</CardTitle>
          <CardDescription className="description-class">Description</CardDescription>
          <CardAction className="action-class">Action</CardAction>
        </CardHeader>
        <CardContent className="content-class">Content</CardContent>
        <CardFooter className="footer-class">Footer</CardFooter>
      </Card>
    )

    for (const [className, baseClass] of [
      ['card-class', 'rounded-none'],
      ['header-class', 'grid'],
      ['title-class', 'font-semibold'],
      ['description-class', 'text-muted-foreground'],
      ['action-class', 'justify-self-end'],
      ['content-class', 'px-6'],
      ['footer-class', 'items-center'],
    ] as const) {
      const el = document.querySelector(`.${className}`)
      expect(el).toBeTruthy()
      expect(el?.className).toContain(baseClass)
    }
  })
})
