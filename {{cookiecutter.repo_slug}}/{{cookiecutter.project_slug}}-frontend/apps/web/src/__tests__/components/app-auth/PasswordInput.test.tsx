import { PasswordInput } from '@/components/app-auth/PasswordInput'

import { test } from '@fast-check/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('PasswordInput', () => {
  test.prop([fc.string()])('holds an arbitrary value masked, and reveals it verbatim on toggle', (value) => {
    // fast-check runs many iterations within this one test - vitest's own afterEach cleanup only
    // fires between tests, not between property iterations, so a stale render from the previous
    // iteration would otherwise still be mounted and make getByLabelText ambiguous.
    cleanup()
    render(<PasswordInput aria-label="password" value={value} onChange={() => {}} />)
    const input = screen.getByLabelText('password') as HTMLInputElement
    expect(input.value).toBe(value)

    fireEvent.click(screen.getByRole('button'))
    expect(input.value).toBe(value)
  })

  // A plain example rather than folded into the property test above: Stryker's coverage tracking
  // for a fast-check property test does not reliably credit or re-run it per mutant (confirmed by
  // reproducing a mutation here directly with `vitest run` - the assertion does fail, just not
  // under Stryker), so the type-attribute assertions live in their own ordinary test instead.
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
