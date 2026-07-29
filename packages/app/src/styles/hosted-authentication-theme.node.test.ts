/** @file Hosted identity 紫色主题契约测试 / Hosted-identity purple-theme contract tests. */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** @brief Hosted identity 样式路径 / Hosted-identity stylesheet path. */
const stylesheetPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'shared-ui',
  'hosted-authentication.css'
)

describe('hosted authentication theme', (): void => {
  it('uses the RoleStory light-purple palette instead of the legacy brown palette', (): void => {
    /** @brief Hosted identity 样式源码 / Hosted-identity stylesheet source. */
    const source = readFileSync(stylesheetPath, 'utf8')

    expect(source).toContain('background: #f6f4f8')
    expect(source).toContain('background: #6d35dc')
    expect(source).not.toContain('#7a4d20')
  })
})
