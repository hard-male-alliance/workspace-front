import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

describe('root package scripts', () => {
  test('delegate to the pnpm executable that CI installs instead of nesting Corepack', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )

    const scriptsWithCorepackPnpm = Object.entries(packageJson.scripts)
      .filter(([, command]) => /\bcorepack\s+pnpm\b/.test(command))
      .map(([scriptName]) => scriptName)

    expect(scriptsWithCorepackPnpm).toEqual([])
  })
})
