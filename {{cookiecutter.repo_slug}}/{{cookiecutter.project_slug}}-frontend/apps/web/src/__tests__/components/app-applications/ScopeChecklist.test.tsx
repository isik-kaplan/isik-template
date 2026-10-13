import { ScopeChecklist } from '@/components/app-applications/ScopeChecklist'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const SCOPES = [
  { name: 'a:read:x', label: 'Read x' },
  { name: 'b:write:x', label: 'Write x' },
  { name: 'c:delete:x', label: 'Delete x' },
]

describe('ScopeChecklist', () => {
  it('shows nothing when there is nothing to choose', () => {
    const { container } = render(<ScopeChecklist legend="Pick" scopes={[]} value={[]} onChange={vi.fn()} />)

    expect(container.innerHTML).toBe('')
  })

  it('words each scope and names it, ticking what is chosen', () => {
    render(<ScopeChecklist legend="Pick" scopes={SCOPES} value={['b:write:x']} onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Pick' })).toBeTruthy()
    expect(screen.getByText('a:read:x')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /Read x/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /Write x/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('adds a ticked scope in name order', async () => {
    const onChange = vi.fn()
    render(<ScopeChecklist legend="Pick" scopes={SCOPES} value={['c:delete:x']} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /Read x/ }))

    expect(onChange).toHaveBeenCalledWith(['a:read:x', 'c:delete:x'])
  })

  it('drops an unticked scope and keeps the others', async () => {
    const onChange = vi.fn()
    render(<ScopeChecklist legend="Pick" scopes={SCOPES} value={['a:read:x', 'b:write:x']} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /Read x/ }))

    expect(onChange).toHaveBeenCalledWith(['b:write:x'])
  })
})
