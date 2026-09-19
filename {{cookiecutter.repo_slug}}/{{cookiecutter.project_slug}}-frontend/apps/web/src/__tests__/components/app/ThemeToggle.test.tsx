import { ThemeToggle } from '@/components/app/ThemeToggle'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const setTheme = vi.fn()
let resolvedTheme = 'light'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme, setTheme }),
}))

describe('ThemeToggle', () => {
  it('offers to switch to dark when currently light', () => {
    resolvedTheme = 'light'
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()
  })

  it('offers to switch to light when currently dark', () => {
    resolvedTheme = 'dark'
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeTruthy()
  })

  it('flips the theme on click', async () => {
    resolvedTheme = 'light'
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button'))

    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('flips back to light on click when currently dark', async () => {
    resolvedTheme = 'dark'
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button'))

    expect(setTheme).toHaveBeenCalledWith('light')
  })
})
