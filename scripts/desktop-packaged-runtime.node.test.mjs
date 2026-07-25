import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  closeBrowserWithinDeadline,
  removeTemporaryDirectory,
  removeTemporaryDirectoryWithinDeadline,
  settleWithinDeadline,
  terminateChildWithinDeadline,
  waitForChildExit
} from './desktop-packaged-runtime.mjs'

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn()
  }
}

class FakeChildProcess extends EventEmitter {
  constructor(killImplementation = () => true) {
    super()
    this.exitCode = null
    this.killImplementation = killImplementation
    this.signalCode = null
    this.signals = []
  }

  exit(signal = null) {
    if (signal === null) this.exitCode = 0
    else this.signalCode = signal
    this.emit('exit', this.exitCode, this.signalCode)
  }

  kill(signal) {
    this.signals.push(signal)
    return this.killImplementation(signal, this)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('settleWithinDeadline', () => {
  it('returns a timeout without surfacing a late rejection', async () => {
    vi.useFakeTimers()
    let rejectOperation
    const operation = new Promise((resolve, reject) => {
      rejectOperation = reject
    })
    const result = settleWithinDeadline(operation, 10)

    await vi.advanceTimersByTimeAsync(10)
    await expect(result).resolves.toEqual({ status: 'timed-out' })

    rejectOperation(new Error('late failure'))
    await Promise.resolve()
  })
})

describe('closeBrowserWithinDeadline', () => {
  it('reports a normally closed Playwright connection', async () => {
    const logger = createLogger()

    await expect(
      closeBrowserWithinDeadline({ close: vi.fn().mockResolvedValue(undefined) }, { logger })
    ).resolves.toBe(true)

    expect(logger.info).toHaveBeenLastCalledWith(
      'Desktop smoke cleanup: Playwright connection closed.'
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('continues cleanup when Playwright close exceeds its deadline', async () => {
    vi.useFakeTimers()
    const logger = createLogger()
    const close = vi.fn(() => new Promise(() => undefined))
    const result = closeBrowserWithinDeadline({ close }, { logger, timeoutMilliseconds: 10 })

    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toBe(false)
    expect(close).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      'Desktop smoke cleanup: Playwright close exceeded 10ms; continuing with process shutdown.'
    )
  })

  it('continues cleanup when Playwright close rejects', async () => {
    const logger = createLogger()

    await expect(
      closeBrowserWithinDeadline(
        { close: vi.fn().mockRejectedValue(new Error('connection lost')) },
        { logger }
      )
    ).resolves.toBe(false)

    expect(logger.warn).toHaveBeenCalledWith(
      'Desktop smoke cleanup: Playwright close failed; continuing with process shutdown: connection lost.'
    )
  })
})

describe('terminateChildWithinDeadline', () => {
  it('observes an exit that races with listener registration', async () => {
    const child = new FakeChildProcess()
    const registerOnce = child.once.bind(child)
    child.once = (event, listener) => {
      const registered = registerOnce(event, listener)
      child.exitCode = 0
      return registered
    }

    await expect(waitForChildExit(child, 10)).resolves.toBe(true)
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('does not signal an Electron process that already exited', async () => {
    const child = new FakeChildProcess()
    const logger = createLogger()
    child.exitCode = 0

    await expect(terminateChildWithinDeadline(child, { logger })).resolves.toBe('already-exited')

    expect(child.signals).toEqual([])
  })

  it('waits for Electron to exit after SIGTERM', async () => {
    const child = new FakeChildProcess((signal, process) => {
      queueMicrotask(() => process.exit(signal))
      return true
    })

    await expect(terminateChildWithinDeadline(child, { logger: createLogger() })).resolves.toBe(
      'sigterm'
    )

    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('escalates to SIGKILL when Electron ignores SIGTERM', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess((signal, process) => {
      if (signal === 'SIGKILL') queueMicrotask(() => process.exit(signal))
      return true
    })
    const result = terminateChildWithinDeadline(child, {
      killTimeoutMilliseconds: 5,
      logger: createLogger(),
      termTimeoutMilliseconds: 10
    })

    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toBe('sigkill')
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  it('fails within the kill deadline when Electron ignores SIGKILL', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess()
    const result = terminateChildWithinDeadline(child, {
      killTimeoutMilliseconds: 5,
      logger: createLogger(),
      termTimeoutMilliseconds: 10
    })
    const assertion = expect(result).rejects.toThrow(
      'Desktop smoke Electron process did not exit within 5ms after SIGKILL.'
    )

    await vi.advanceTimersByTimeAsync(15)

    await assertion
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('reports an undeliverable SIGKILL without waiting indefinitely', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess((signal) => signal !== 'SIGKILL')
    const result = terminateChildWithinDeadline(child, {
      killTimeoutMilliseconds: 5,
      logger: createLogger(),
      termTimeoutMilliseconds: 10
    })
    const assertion = expect(result).rejects.toThrow(
      'Desktop smoke could not deliver SIGKILL to the Electron process.'
    )

    await vi.advanceTimersByTimeAsync(15)

    await assertion
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('reports an undeliverable SIGTERM without waiting indefinitely', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess(() => false)
    const result = terminateChildWithinDeadline(child, {
      logger: createLogger(),
      termTimeoutMilliseconds: 10
    })
    const assertion = expect(result).rejects.toThrow(
      'Desktop smoke could not deliver SIGTERM to the Electron process.'
    )

    await vi.advanceTimersByTimeAsync(10)

    await assertion
    expect(child.signals).toEqual(['SIGTERM'])
  })
})

describe('removeTemporaryDirectory', () => {
  it('retries transient Windows profile locks before completing cleanup', async () => {
    const attempts = []
    const waits = []

    await removeTemporaryDirectory('C:\\temp\\profile', {
      maxAttempts: 3,
      remove: async (directory, options) => {
        attempts.push({ directory, options })
        if (attempts.length === 1) {
          const error = new Error('resource busy')
          error.code = 'EBUSY'
          throw error
        }
      },
      sleep: async (milliseconds) => {
        waits.push(milliseconds)
      }
    })

    expect(attempts).toEqual([
      {
        directory: 'C:\\temp\\profile',
        options: { force: true, recursive: true }
      },
      {
        directory: 'C:\\temp\\profile',
        options: { force: true, recursive: true }
      }
    ])
    expect(waits).toEqual([100])
  })
})

describe('removeTemporaryDirectoryWithinDeadline', () => {
  it('fails within its deadline when temporary profile removal hangs', async () => {
    vi.useFakeTimers()
    const result = removeTemporaryDirectoryWithinDeadline('/tmp/profile', {
      logger: createLogger(),
      remove: () => new Promise(() => undefined),
      timeoutMilliseconds: 10
    })
    const assertion = expect(result).rejects.toThrow(
      'Desktop smoke temporary profile cleanup exceeded 10ms.'
    )

    await vi.advanceTimersByTimeAsync(10)

    await assertion
  })
})
