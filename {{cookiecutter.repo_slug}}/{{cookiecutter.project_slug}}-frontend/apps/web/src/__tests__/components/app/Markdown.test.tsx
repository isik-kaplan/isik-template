import { Markdown } from '@/components/app/Markdown'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Markdown', () => {
  it('renders markdown source as real HTML', () => {
    render(<Markdown>{'# Title\n\nSome *body* text.'}</Markdown>)

    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy()
    expect(screen.getByText('body').tagName).toBe('EM')
  })

  it('renders GitHub-flavored tables via remark-gfm', () => {
    render(<Markdown>{'| a | b |\n| - | - |\n| 1 | 2 |'}</Markdown>)

    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('merges an extra className onto the card, alongside the built-in prose styling', () => {
    const { container } = render(<Markdown className="custom-class">Body</Markdown>)

    const card = container.querySelector('.custom-class')
    expect(card).toBeTruthy()
    expect(card?.className).toContain('prose')
  })
})
