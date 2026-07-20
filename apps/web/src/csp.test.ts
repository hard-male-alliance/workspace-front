import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Web Content Security Policy', (): void => {
  it('allows the configured 127.0.0.1 development API origin', (): void => {
    const html = readFileSync(resolve(process.cwd(), 'apps/web/index.html'), 'utf8')

    expect(html).toContain(
      "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:*"
    )
  })
})
