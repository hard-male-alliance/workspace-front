import { describe, expect, it } from 'vitest'

import { removeTemporaryDirectory } from './desktop-packaged-runtime.mjs'

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
