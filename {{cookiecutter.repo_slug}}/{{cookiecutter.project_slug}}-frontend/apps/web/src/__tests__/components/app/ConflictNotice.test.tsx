import { ConflictNotice } from '@/components/app/ConflictNotice'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Out here rather than inline: a JSX object literal's double brace is a template expression to cookiecutter.
const DELETED = { current: null }
const REFUSED = { current: { name: 'theirs' } }

describe('ConflictNotice', () => {
  it('says nothing while nothing was refused', () => {
    const { container } = render(<ConflictNotice conflict={null} takeTheirs={vi.fn()} keepMine={vi.fn()} />)

    expect(container.innerHTML).toBe('')
  })

  it('offers nothing once it was deleted: there is nothing to take, and nothing to write over', () => {
    const { container } = render(<ConflictNotice conflict={DELETED} takeTheirs={vi.fn()} keepMine={vi.fn()} />)

    expect(container.innerHTML).toBe('')
  })

  it('offers their version or this one', async () => {
    const takeTheirs = vi.fn()
    const keepMine = vi.fn(async () => true)
    render(<ConflictNotice conflict={REFUSED} takeTheirs={takeTheirs} keepMine={keepMine} />)

    expect(screen.getByRole('alert').textContent).toContain('Someone else saved this since you opened it.')
    await userEvent.click(screen.getByRole('button', { name: 'Use their version' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save mine over it' }))

    expect(takeTheirs).toHaveBeenCalledOnce()
    expect(keepMine).toHaveBeenCalledOnce()
  })

  it('holds both choices while a save is out', () => {
    render(<ConflictNotice conflict={REFUSED} takeTheirs={vi.fn()} keepMine={vi.fn()} disabled />)

    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})
