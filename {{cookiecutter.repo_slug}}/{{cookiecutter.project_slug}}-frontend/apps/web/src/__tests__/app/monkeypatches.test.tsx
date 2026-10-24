import MonkeyPatches from '@/app/monkeypatches'

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const session = vi.fn().mockResolvedValue({})
const globalApi = vi.fn((_window: Window) => ({ auth: { session } }))

vi.mock('@/lib/monkeypatches', () => ({
  globalApi: (window: Window) => globalApi(window),
}))

describe('MonkeyPatches', () => {
  it('wires up the window-exposed API client and console switch on mount', () => {
    render(<MonkeyPatches />)

    expect(globalApi).toHaveBeenCalledWith(window)
    expect(session).toHaveBeenCalledOnce()
  })

  it('renders nothing', () => {
    const { container } = render(<MonkeyPatches />)

    expect(container.firstChild).toBeNull()
  })
})
