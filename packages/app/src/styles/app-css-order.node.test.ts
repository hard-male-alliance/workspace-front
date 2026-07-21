/** @file 应用样式级联顺序契约测试 / Application stylesheet cascade-order contract tests. */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** @brief 当前样式目录 / Current styles directory. */
const styleDirectory = path.dirname(fileURLToPath(import.meta.url))

/** @brief 应用样式入口 / Application stylesheet entry point. */
const styleEntryPath = path.join(styleDirectory, 'app.css')

/** @brief CSS 导入语句匹配器 / CSS import statement matcher. */
const importPattern = /^@import\s+['"]([^'"]+)['"];\r?$/gm

/** @brief 固定的级联导入顺序 / Fixed cascade import order. */
const expectedImportPaths = [
  '../ui/design-tokens.css',
  '../ui/ui.css',
  './foundation.css',
  './knowledge/remote-operations.css',
  './interview/workspace.css',
  './resume/workspace.css',
  './shell/base.css',
  './shared-ui/core.css',
  './workspace/home.css',
  './shared-ui/status.css',
  './resume/editor.css',
  './shared-ui/domain-layouts.css',
  './resume/templates.css',
  './interview/session.css',
  './knowledge/library.css',
  './app-support/states.css',
  './app-support/responsive.css'
] as const

/**
 * @brief 拆分前规则正文的 SHA-256 摘要 / SHA-256 digest of the pre-split rule body.
 * @note 此摘要锁定选择器、声明、空白及相对顺序 / This digest locks selectors, declarations, whitespace, and relative order.
 */
const expectedMigratedBodyDigest =
  'd901f86eec4c504ac2dd8439a4cbdf0dae0fe0ef61cadbbac1be7928f53ac711'

/**
 * @brief 递归收集目录中的 CSS 文件 / Recursively collect CSS files in a directory.
 * @param directory 待扫描目录 / Directory to scan.
 * @return CSS 文件绝对路径 / Absolute paths of CSS files.
 */
function collectStyleSheets(directory: string): string[] {
  /** @brief 当前目录及后代的 CSS 文件 / CSS files in the current directory and descendants. */
  const styleSheets: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    /** @brief 当前目录项绝对路径 / Absolute path of the current directory entry. */
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      styleSheets.push(...collectStyleSheets(absolutePath))
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      styleSheets.push(absolutePath)
    }
  }

  return styleSheets
}

describe('app.css cascade contract', (): void => {
  it('keeps the entry point import-only and fixes the complete cascade order', (): void => {
    /** @brief 样式入口源码 / Stylesheet entry source. */
    const entrySource = readFileSync(styleEntryPath, 'utf8')
    /** @brief 从入口提取的导入路径 / Import paths extracted from the entry point. */
    const actualImportPaths = [...entrySource.matchAll(importPattern)].map((match) => match[1])
    /** @brief 移除导入后的入口内容 / Entry content remaining after imports are removed. */
    const nonImportSource = entrySource.replace(importPattern, '').trim()

    expect(actualImportPaths).toEqual(expectedImportPaths)
    expect(nonImportSource).toBe('')
  })

  it('imports every fragment once without nested imports and preserves the migrated body byte order', (): void => {
    /** @brief 入口中受本测试管理的本地分片 / Local fragments managed by this contract. */
    const expectedFragmentPaths = expectedImportPaths.filter((importPath) =>
      importPath.startsWith('./')
    )
    /** @brief 样式目录中实际存在的本地分片 / Local fragments present in the styles directory. */
    const actualFragmentPaths = collectStyleSheets(styleDirectory)
      .map(
        (absolutePath) =>
          `./${path.relative(styleDirectory, absolutePath).split(path.sep).join('/')}`
      )
      .filter((relativePath) => relativePath !== './app.css')
      .sort()
    /** @brief 按入口顺序读取的分片内容 / Fragment sources read in entry-point order. */
    const fragmentSources = expectedFragmentPaths.map((importPath) =>
      readFileSync(path.resolve(styleDirectory, importPath), 'utf8')
    )
    /** @brief 按最终级联顺序拼接的迁移正文 / Migrated body joined in final cascade order. */
    const migratedBody = fragmentSources.join('\n')
    /** @brief 迁移正文 SHA-256 摘要 / SHA-256 digest of the migrated body. */
    const migratedBodyDigest = createHash('sha256').update(migratedBody).digest('hex')

    expect(actualFragmentPaths).toEqual([...expectedFragmentPaths].sort())
    expect(new Set(expectedFragmentPaths).size).toBe(expectedFragmentPaths.length)
    expect(fragmentSources.every((source) => !source.includes('@import'))).toBe(true)
    expect(migratedBodyDigest).toBe(expectedMigratedBodyDigest)
  })
})
