#!/usr/bin/env node

/** @file 生产构建产物的测试数据泄漏门禁 / Test-data leak gate for production build artifacts. */

import { lstat, readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** @brief 仓库默认根目录 / Default repository root. */
const defaultRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @brief 可包含前端运行时代码或入口标记的文本扩展名 / Text extensions that can contain frontend runtime code or entry markup. */
const PRODUCTION_ARTIFACT_TEXT_EXTENSIONS = new Set(['.cjs', '.html', '.js', '.mjs'])

/**
 * @brief 来自自动化测试内存数据的高信号标识 / High-signal identifiers from automated-test in-memory data.
 * @note 刻意不匹配泛化的 mock/demo 文案，避免误报产品术语 “Mock interview” / Deliberately excludes generic mock/demo copy so the product term “Mock interview” is never rejected.
 */
export const PRODUCTION_TEST_DATA_SENTINELS = Object.freeze([
  { name: 'workspace fixture ID', value: 'ws_mock_klee_career_lab' },
  { name: 'resume fixture ID', value: 'res_mock_ai_platform' },
  { name: 'resume template fixture ID', value: 'tpl_mock_dawn' },
  { name: 'resume template fixture ID', value: 'tpl_mock_editorial' },
  { name: 'knowledge fixture ID', value: 'knowledge_mock_resume_source' },
  { name: 'knowledge fixture ID', value: 'knowledge_mock_git_source' },
  { name: 'knowledge fixture ID', value: 'knowledge_mock_blog_source' },
  { name: 'knowledge fixture ID', value: 'knowledge_mock_file_source' },
  { name: 'interview scenario fixture ID', value: 'scn_mock_system_design' },
  { name: 'interview session fixture ID', value: 'int_mock_system_design' },
  { name: 'interview report fixture ID', value: 'rpt_mock_system_design' },
  { name: 'resume Render Job fixture ETag', value: 'memory-render-job-1' },
  { name: 'in-memory adapter', value: 'InMemoryWorkspaceGateway' },
  { name: 'in-memory adapter', value: 'InMemoryResumeGateway' },
  { name: 'in-memory adapter', value: 'InMemoryInterviewGateway' },
  { name: 'in-memory adapter', value: 'InMemoryKnowledgeGateway' },
  { name: 'in-memory adapter error', value: 'InMemoryGatewayError' }
])

/** @brief 默认扫描的生产产物目标 / Production artifact targets scanned by default. */
const PRODUCTION_ARTIFACT_TARGETS = Object.freeze({
  desktop: 'apps/desktop/out',
  web: 'apps/web/dist'
})

/**
 * @typedef {object} ProductionArtifactEntry
 * @property {string} path 产物中的稳定路径 / Stable path inside the artifact.
 * @property {string | Buffer} content 产物文本或字节 / Artifact text or bytes.
 */

/**
 * @typedef {object} ProductionArtifactViolation
 * @property {string} file 泄漏所在产物 / Artifact containing the leak.
 * @property {string} sentinel 标识说明 / Sentinel description.
 * @property {string} value 命中的精确值 / Exact matched value.
 */

/**
 * @brief 判断产物路径是否应作为运行时文本扫描 / Decide whether an artifact path should be scanned as runtime text.
 * @param {string} artifactPath 产物路径 / Artifact path.
 * @return {boolean} JS 或 HTML 文本为 true / True for JavaScript or HTML text.
 */
export function isProductionArtifactTextPath(artifactPath) {
  return PRODUCTION_ARTIFACT_TEXT_EXTENSIONS.has(path.extname(artifactPath).toLowerCase())
}

/**
 * @brief 扫描一组生产产物文本 / Scan a collection of production artifact texts.
 * @param {Iterable<ProductionArtifactEntry>} entries 产物条目 / Artifact entries.
 * @return {{filesScanned: number, violations: ProductionArtifactViolation[]}} 扫描统计与违规 / Scan statistics and violations.
 */
export function inspectProductionArtifactEntries(entries) {
  /** @brief 已扫描文件数 / Number of scanned files. */
  let filesScanned = 0
  /** @brief 发现的全部测试数据泄漏 / All detected test-data leaks. */
  const violations = []

  for (const entry of entries) {
    if (!isProductionArtifactTextPath(entry.path)) continue
    filesScanned += 1
    /** @brief 当前产物的 UTF-8 文本 / UTF-8 text of the current artifact. */
    const text = typeof entry.content === 'string' ? entry.content : entry.content.toString('utf8')

    for (const sentinel of PRODUCTION_TEST_DATA_SENTINELS) {
      if (text.includes(sentinel.value)) {
        violations.push({ file: entry.path, sentinel: sentinel.name, value: sentinel.value })
      }
    }
  }

  violations.sort(
    (left, right) => left.file.localeCompare(right.file) || left.value.localeCompare(right.value)
  )
  return { filesScanned, violations }
}

/**
 * @brief 递归读取目录内可扫描的生产文本 / Recursively read scannable production texts in a directory.
 * @param {string} directory 当前目录 / Current directory.
 * @param {string} artifactRoot 产物根目录 / Artifact root directory.
 * @param {ProductionArtifactEntry[]} entries 输出条目 / Output entries.
 * @return {Promise<void>} 完成 Promise / Completion promise.
 * @note 不跟随符号链接，避免扫描逃逸产物根 / Symbolic links are not followed so scanning cannot escape the artifact root.
 */
async function collectProductionArtifactEntries(directory, artifactRoot, entries) {
  /** @brief 当前目录项 / Current directory entries. */
  const directoryEntries = await readdir(directory, { withFileTypes: true })

  for (const directoryEntry of directoryEntries) {
    /** @brief 当前目录项绝对路径 / Absolute path of the current entry. */
    const absolutePath = path.join(directory, directoryEntry.name)
    if (directoryEntry.isDirectory()) {
      await collectProductionArtifactEntries(absolutePath, artifactRoot, entries)
      continue
    }
    if (!directoryEntry.isFile() || !isProductionArtifactTextPath(directoryEntry.name)) continue

    entries.push({
      content: await readFile(absolutePath),
      path: path.relative(artifactRoot, absolutePath).split(path.sep).join('/')
    })
  }
}

/**
 * @brief 扫描一个已生成的生产产物目录 / Inspect one generated production artifact directory.
 * @param {string} artifactRoot 产物根目录 / Artifact root directory.
 * @return {Promise<{filesScanned: number, violations: ProductionArtifactViolation[]}>} 扫描结果 / Inspection result.
 * @throws 目录缺失、不是目录或无法读取时抛出 / Throws when the target is missing, is not a directory, or cannot be read.
 */
export async function inspectProductionArtifactDirectory(artifactRoot) {
  /** @brief 产物根元数据 / Artifact-root metadata. */
  const metadata = await lstat(artifactRoot)
  if (!metadata.isDirectory()) {
    throw new Error(`Production artifact target is not a directory: ${artifactRoot}`)
  }

  /** @brief 从目录收集的运行时文本 / Runtime texts collected from the directory. */
  const entries = []
  await collectProductionArtifactEntries(artifactRoot, artifactRoot, entries)
  return inspectProductionArtifactEntries(entries)
}

/**
 * @brief 对测试数据泄漏执行失败关闭断言 / Assert fail-closed against test-data leaks.
 * @param {{filesScanned: number, violations: ProductionArtifactViolation[]}} result 扫描结果 / Inspection result.
 * @param {string} targetLabel 用户可读目标名 / Human-readable target label.
 * @return {void} 无返回值 / No return value.
 * @throws 任一高信号测试标识进入产物时抛出 / Throws when any high-signal test identifier reaches an artifact.
 */
export function assertProductionArtifactDataBoundary(result, targetLabel) {
  if (result.filesScanned === 0) {
    throw new Error(`Production artifact target contains no JavaScript or HTML: ${targetLabel}`)
  }
  if (result.violations.length === 0) return

  /** @brief 稳定、可操作的泄漏列表 / Stable, actionable leak list. */
  const details = result.violations
    .map(
      (violation) => `${violation.file}: ${violation.sentinel} ${JSON.stringify(violation.value)}`
    )
    .join('\n')
  throw new Error(`Production artifact contains automated-test data (${targetLabel}):\n${details}`)
}

/**
 * @brief 扫描选定的 Web/Electron 构建目录 / Inspect selected Web and Electron build directories.
 * @param {{rootDir?: string, targets?: readonly ('web' | 'desktop')[]}} [options] 仓库根与目标 / Repository root and targets.
 * @return {Promise<{filesScanned: number, targets: number}>} 汇总统计 / Aggregate statistics.
 */
export async function verifyProductionArtifactDirectories(options = {}) {
  /** @brief 已规范化仓库根 / Normalized repository root. */
  const rootDir = path.resolve(options.rootDir ?? defaultRepositoryRoot)
  /** @brief 本次明确选择的目标 / Explicitly selected targets. */
  const targets = options.targets ?? ['web', 'desktop']
  /** @brief 所有目标的扫描文件数 / Files scanned across all targets. */
  let filesScanned = 0

  for (const target of targets) {
    /** @brief 当前目标相对目录 / Relative directory for the current target. */
    const relativeDirectory = PRODUCTION_ARTIFACT_TARGETS[target]
    if (relativeDirectory === undefined)
      throw new Error(`Unknown production artifact target: ${target}`)
    /** @brief 当前目标绝对目录 / Absolute directory for the current target. */
    const absoluteDirectory = path.join(rootDir, relativeDirectory)
    /** @brief 当前目标扫描结果 / Inspection result for the current target. */
    const result = await inspectProductionArtifactDirectory(absoluteDirectory)
    assertProductionArtifactDataBoundary(result, relativeDirectory)
    filesScanned += result.filesScanned
  }

  return { filesScanned, targets: targets.length }
}

/**
 * @brief 解析 CLI 的目标选择 / Parse target selection from CLI arguments.
 * @param {string[]} arguments_ CLI 参数 / CLI arguments.
 * @return {readonly ('web' | 'desktop')[]} 需要扫描的目标 / Targets to inspect.
 */
function parseTargets(arguments_) {
  if (arguments_.length === 0) return ['web', 'desktop']
  /** @brief 去重后的目标 / Deduplicated targets. */
  const targets = []
  for (const argument of arguments_) {
    /** @brief 当前参数对应的目标 / Target represented by the current argument. */
    const target = argument === '--web' ? 'web' : argument === '--desktop' ? 'desktop' : undefined
    if (target === undefined) {
      throw new Error('Usage: node scripts/check-production-artifacts.mjs [--web] [--desktop]')
    }
    if (!targets.includes(target)) targets.push(target)
  }
  return targets
}

/**
 * @brief 执行产物门禁 CLI / Run the production-artifact gate CLI.
 * @param {string[]} [arguments_] CLI 参数 / CLI arguments.
 * @return {Promise<number>} 0 通过、1 违规或运行错误 / Zero on success, one on a violation or operational error.
 */
export async function runProductionArtifactCli(arguments_ = process.argv.slice(2)) {
  try {
    /** @brief CLI 选择的构建目标 / Build targets selected by the CLI. */
    const targets = parseTargets(arguments_)
    /** @brief 所有选定目标的扫描统计 / Scan statistics for all selected targets. */
    const result = await verifyProductionArtifactDirectories({ targets })
    process.stdout.write(
      `Production artifact data boundary passed (${String(result.filesScanned)} JS/HTML files across ${String(result.targets)} target(s)).\n`
    )
    return 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runProductionArtifactCli()
}
