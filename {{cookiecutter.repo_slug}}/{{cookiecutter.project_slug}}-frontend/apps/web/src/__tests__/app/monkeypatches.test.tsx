import MonkeyPatches from '@/app/monkeypatches'

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const noDirectConsoleLog = vi.fn()
const session = vi.fn().mockResolvedValue({})
const globalApi = vi.fn((_window: Window) => ({ auth: { session } }))

vi.mock('@/lib/monkeypatches', () => ({
  noDirectConsoleLog: (window: Window) => noDirectConsoleLog(window),
  globalApi: (window: Window) => globalApi(window),
}))

describe('MonkeyPatches', () => {
  it('wires up the console silencer and the window-exposed API client on mount', () => {
    render(<MonkeyPatches />)

    expect(noDirectConsoleLog).toHaveBeenCalledWith(window)
    expect(globalApi).toHaveBeenCalledWith(window)
    expect(session).toHaveBeenCalledOnce()
  })

  it('renders nothing', () => {
    const { container } = render(<MonkeyPatches />)

    expect(container.firstChild).toBeNull()
  })
})
