/** @file 生产产物测试数据泄漏门禁的 Node fixture 测试 / Node fixture tests for the production-artifact test-data leak gate. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assertProductionArtifactDataBoundary,
  inspectProductionArtifactDirectory,
  inspectProductionArtifactEntries,
  PRODUCTION_TEST_DATA_SENTINELS,
  verifyProductionArtifactDirectories
} from './check-production-artifacts.mjs'

/** @brief 仓库根目录 / Repository root directory. */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @brief 产物标识唯一允许来源的测试内存源码 / Test-memory sources that are the only allowed origin of artifact sentinels. */
const memorySourcePaths = [
  'packages/app/src/infrastructure/memory/behavior.ts',
  'packages/app/src/contexts/workspace/infrastructure/memory/data.ts',
  'packages/app/src/contexts/workspace/infrastructure/memory/gateway.ts',
  'packages/app/src/contexts/resume/infrastructure/memory/data.ts',
  'packages/app/src/contexts/resume/infrastructure/memory/gateway.ts',
  'packages/app/src/contexts/workspace-operations/infrastructure/memory/store.ts',
  'packages/app/src/contexts/workspace-operations/infrastructure/memory/gateway.ts',
  'packages/app/src/contexts/interview/infrastructure/memory/data.ts',
  'packages/app/src/contexts/interview/infrastructure/memory/gateway.ts',
  'packages/app/src/contexts/knowledge/infrastructure/memory/data.ts',
  'packages/app/src/contexts/knowledge/infrastructure/memory/gateway.ts'
]

/**
 * @brief 在隔离临时目录创建产物 fixture / Create an artifact fixture in an isolated temporary directory.
 * @param {Record<string, string>} files 相对路径与文本 / Relative paths and text content.
 * @param {(rootDir: string) => Promise<void>} assertion fixture 断言 / Fixture assertion.
 * @return {Promise<void>} 完成 Promise / Completion promise.
 */
async function withArtifactFixture(files, assertion) {
  /** @brief 系统临时目录下的隔离根 / Isolated root under the system temporary directory. */
  const rootDir = await mkdtemp(path.join(tmpdir(), 'production-artifact-gate-'))
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      /** @brief 当前 fixture 绝对路径 / Absolute path of the current fixture. */
      const absolutePath = path.join(rootDir, relativePath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, content, 'utf8')
    }
    await assertion(rootDir)
  } finally {
    await rm(rootDir, { force: true, recursive: true })
  }
}

describe('production artifact data boundary', () => {
  it('保持 sentinel 与当前测试内存实现同步', async () => {
    /** @brief 所有测试内存实现的合并源码 / Combined source of all test-memory implementations. */
    const memorySources = (
      await Promise.all(
        memorySourcePaths.map((relativePath) =>
          readFile(path.join(repositoryRoot, relativePath), 'utf8')
        )
      )
    ).join('\n')

    for (const sentinel of PRODUCTION_TEST_DATA_SENTINELS) {
      expect(memorySources, sentinel.value).toContain(sentinel.value)
    }
  })

  it('允许产品模拟面试文案并忽略非运行时文本', async () => {
    await withArtifactFixture(
      {
        'assets/index.js': "export const title = 'Mock interview'\n",
        'index.html': '<main>模拟面试</main>',
        'notes.txt': 'ws_mock_klee_career_lab'
      },
      async (rootDir) => {
        /** @brief 合法产品文案 fixture 的扫描结果 / Scan result for valid product-copy fixtures. */
        const result = await inspectProductionArtifactDirectory(rootDir)
        expect(result).toEqual({ filesScanned: 2, violations: [] })
        expect(() => assertProductionArtifactDataBoundary(result, 'fixture')).not.toThrow()
      }
    )
  })

  it('拒绝内存数据 ID 与 adapter 标识进入 JS/HTML', () => {
    /** @brief 模拟 ASAR 或目录条目的内存扫描结果 / In-memory result representing ASAR or directory entries. */
    const result = inspectProductionArtifactEntries([
      { content: "const id='res_mock_ai_platform'", path: 'assets/resume.js' },
      { content: '<script>new InMemoryKnowledgeGateway()</script>', path: 'index.html' }
    ])

    expect(result.violations).toEqual([
      {
        file: 'assets/resume.js',
        sentinel: 'resume fixture ID',
        value: 'res_mock_ai_platform'
      },
      {
        file: 'index.html',
        sentinel: 'in-memory adapter',
        value: 'InMemoryKnowledgeGateway'
      }
    ])
    expect(() => assertProductionArtifactDataBoundary(result, 'fixture')).toThrowError(
      /Production artifact contains automated-test data/u
    )
  })

  it('从 Web 与 Electron 的标准输出目录执行同一门禁', async () => {
    await withArtifactFixture(
      {
        'apps/desktop/out/main/index.js': 'export const desktop = true\n',
        'apps/desktop/out/renderer/index.html': '<main>Desktop</main>',
        'apps/web/dist/assets/index.js': 'export const web = true\n',
        'apps/web/dist/index.html': '<main>Web</main>'
      },
      async (rootDir) => {
        await expect(verifyProductionArtifactDirectories({ rootDir })).resolves.toEqual({
          filesScanned: 4,
          targets: 2
        })
      }
    )
  })

  it('对空产物目录失败关闭', async () => {
    await withArtifactFixture({ '.keep': '' }, async (rootDir) => {
      /** @brief 空目录 fixture 的扫描结果 / Scan result for an empty artifact fixture. */
      const result = await inspectProductionArtifactDirectory(rootDir)
      expect(() => assertProductionArtifactDataBoundary(result, 'fixture')).toThrowError(
        /contains no JavaScript or HTML/u
      )
    })
  })
})
