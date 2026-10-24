import { PasswordInput } from '@/components/app-auth/PasswordInput'

import { test } from '@fast-check/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('PasswordInput', () => {
  test.prop([fc.string()])('holds an arbitrary value masked, and reveals it verbatim on toggle', (value) => {
    // afterEach cleanup doesn't run between fast-check iterations.
    cleanup()
    render(<PasswordInput aria-label="password" value={value} onChange={() => {}} />)
    const input = screen.getByLabelText('password') as HTMLInputElement
    expect(input.value).toBe(value)

    fireEvent.click(screen.getByRole('button'))
    expect(input.value).toBe(value)
  })

  // Not in the property test above: Stryker doesn't reliably credit a fast-check property test per mutant.
  it('masks the value behind type="password", and reveals it as type="text" on toggle', () => {
    render(<PasswordInput aria-label="password" value="secret" onChange={() => {}} />)
    const input = screen.getByLabelText('password') as HTMLInputElement
    expect(input.getAttribute('type')).toBe('password')

    fireEvent.click(screen.getByRole('button'))
    expect(input.getAttribute('type')).toBe('text')

    fireEvent.click(screen.getByRole('button'))
    expect(input.getAttribute('type')).toBe('password')
  })

  it('toggles the reveal button label and back on repeated clicks', () => {
    render(<PasswordInput value="secret" onChange={() => {}} />)

    const button = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy()
  })

  it('merges an extra className onto the input, alongside the built-in padding', () => {
    render(<PasswordInput aria-label="password" className="custom-class" value="" onChange={() => {}} />)

    const className = screen.getByLabelText('password').className
    expect(className).toContain('custom-class')
    expect(className).toContain('pr-10')
  })
})
