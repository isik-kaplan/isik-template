import { globalApi, noDirectConsoleLog } from '@/lib/monkeypatches'

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('noDirectConsoleLog', () => {
  const original = {
    log: window.console.log,
    info: window.console.info,
    warn: window.console.warn,
    error: window.console.error,
  }

  afterEach(() => {
    Object.assign(window.console, original)
  })

  it('silences every console method until debug is turned on, then lets them through', () => {
    const spies = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    Object.assign(window.console, spies)

    noDirectConsoleLog(window)
    window.console.log('a')
    window.console.info('b')
    window.console.warn('c')
    window.console.error('d')

    expect(spies.log).not.toHaveBeenCalled()
    expect(spies.info).not.toHaveBeenCalled()
    expect(spies.warn).not.toHaveBeenCalled()
    expect(spies.error).not.toHaveBeenCalled()

    globalApi(window).debug(true)
    window.console.log('a')
    window.console.info('b')
    window.console.warn('c')
    window.console.error('d')

    expect(spies.log).toHaveBeenCalledWith('a')
    expect(spies.info).toHaveBeenCalledWith('b')
    expect(spies.warn).toHaveBeenCalledWith('c')
    expect(spies.error).toHaveBeenCalledWith('d')

    globalApi(window).debug(false)
  })
})

describe('globalApi', () => {
  it('exposes the same typed clients on window, plus a debug toggle', () => {
    const exposed = globalApi(window)

    expect(exposed.api).toBeDefined()
    expect(exposed.auth).toBeDefined()
    expect(typeof exposed.debug).toBe('function')
    expect(window['{{ cookiecutter.project_slug }}']).toBe(exposed)
  })
})
