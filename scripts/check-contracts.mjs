#!/usr/bin/env node

/** @file 共享契约 submodule 完整性门禁 / Shared-contract submodule integrity gate. */

import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

/** @brief Promise 化的子进程执行器 / Promise-based child-process executor. */
const execFileAsync = promisify(execFile)

/** @brief 默认共享契约 submodule 路径 / Default shared-contract submodule path. */
const DEFAULT_SUBMODULE_PATH = 'workspace-shared-docs'

/** @brief 当前版本必须存在的契约入口 / Contract entrypoints required by the current version. */
const REQUIRED_CONTRACT_ENTRIES = Object.freeze([
  'contracts/v2/contract.md',
  'contracts/v2/schema.jsonc',
  'contracts/v2/examples.jsonc',
  'contracts/v2/diff.md'
])

/**
 * @brief 表示可操作的契约门禁失败 / Represent an actionable contract-gate failure.
 */
export class ContractCheckError extends Error {
  /**
   * @brief 创建带稳定错误代码的契约门禁错误 / Create a contract-gate error with a stable code.
   * @param {string} code 机器可读错误代码 / Machine-readable error code.
   * @param {string} message 面向维护者的诊断 / Maintainer-facing diagnostic.
   */
  constructor(code, message) {
    super(message)
    this.name = 'ContractCheckError'
    /** @brief 机器可读错误代码 / Machine-readable error code. */
    this.code = code
  }
}

/**
 * @brief 在指定目录运行只读 Git 命令 / Run a read-only Git command in a directory.
 * @param {string} directory Git 命令工作目录 / Working directory for Git.
 * @param {string[]} gitArguments Git 参数 / Git arguments.
 * @return {Promise<string>} 去除尾部换行的标准输出 / Standard output without trailing newlines.
 */
async function runGit(directory, gitArguments) {
  try {
    /** @brief Git 子进程输出 / Git child-process output. */
    const { stdout } = await execFileAsync('git', ['-C', directory, ...gitArguments], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    })
    return stdout.replace(/[\r\n]+$/u, '')
  } catch (error) {
    /** @brief Git 标准错误诊断 / Git standard-error diagnostic. */
    const stderr =
      error !== null && typeof error === 'object' && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : ''
    throw new ContractCheckError(
      'git-command-failed',
      `无法运行 git ${gitArguments.join(' ')}${stderr === '' ? '' : `：${stderr}`} / ` +
        `Cannot run git ${gitArguments.join(' ')}${stderr === '' ? '.' : `: ${stderr}`}`
    )
  }
}

/**
 * @brief 读取父仓库索引中的固定 gitlink / Read the pinned gitlink from the parent index.
 * @param {string} rootDir 父仓库根目录 / Parent repository root.
 * @param {string} submodulePath submodule 相对路径 / Relative submodule path.
 * @return {Promise<string>} 固定的完整对象 ID / Pinned full object ID.
 */
async function readPinnedGitlink(rootDir, submodulePath) {
  /** @brief 索引中的 submodule 条目 / Submodule entry in the index. */
  const entry = await runGit(rootDir, ['ls-files', '--stage', '--', submodulePath])
  /** @brief Git index 条目的结构化匹配 / Structured match for the Git index entry. */
  const match = /^160000 ([0-9a-f]{40,64}) 0\t.+$/u.exec(entry)

  if (match === null) {
    throw new ContractCheckError(
      'gitlink-missing',
      `父仓库未以 160000 gitlink 跟踪 ${submodulePath}；请恢复固定的 submodule 条目。 / ` +
        `The parent repository does not track ${submodulePath} as a 160000 gitlink; restore the pinned submodule entry.`
    )
  }

  return match[1]
}

/**
 * @brief 验证 submodule 路径保持在父仓库内 / Verify that the submodule path stays inside the parent repository.
 * @param {string} rootDir 父仓库根目录 / Parent repository root.
 * @param {string} submodulePath submodule 相对路径 / Relative submodule path.
 * @return {string} submodule 绝对路径 / Absolute submodule path.
 */
function resolveSubmodulePath(rootDir, submodulePath) {
  /** @brief 规范化父仓库根目录 / Normalized parent root. */
  const normalizedRoot = path.resolve(rootDir)
  /** @brief 规范化 submodule 绝对路径 / Normalized absolute submodule path. */
  const absolutePath = path.resolve(normalizedRoot, submodulePath)
  /** @brief submodule 相对父仓库的规范路径 / Normalized path relative to the parent root. */
  const relativePath = path.relative(normalizedRoot, absolutePath)

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new ContractCheckError(
      'submodule-path-invalid',
      `submodule 路径必须是父仓库内的非根相对路径：${submodulePath}。 / ` +
        `The submodule path must be a non-root relative path inside the parent repository: ${submodulePath}.`
    )
  }

  return absolutePath
}

/**
 * @brief 验证共享契约 submodule 的初始化、内容、洁净度和 revision / Verify initialization, contents, cleanliness, and revision of the shared-contract submodule.
 * @param {{rootDir?: string, submodulePath?: string}} [options] 检查选项 / Check options.
 * @return {Promise<{head: string, requiredEntries: readonly string[], submodulePath: string}>} 已验证状态 / Verified state.
 * @note 该检查只执行读取操作，不拉取、不 checkout，也不修改 submodule。 / This check is read-only: it never fetches, checks out, or modifies the submodule.
 */
export async function checkContracts(options = {}) {
  /** @brief 父仓库绝对根目录 / Absolute parent-repository root. */
  const rootDir = path.resolve(options.rootDir ?? process.cwd())
  /** @brief 待检查的 submodule 相对路径 / Relative submodule path to inspect. */
  const submodulePath = options.submodulePath ?? DEFAULT_SUBMODULE_PATH
  /** @brief 待检查的 submodule 绝对路径 / Absolute submodule path to inspect. */
  const submoduleRoot = resolveSubmodulePath(rootDir, submodulePath)
  /** @brief 父仓库索引固定的 revision / Revision pinned by the parent index. */
  const pinnedRevision = await readPinnedGitlink(rootDir, submodulePath)

  try {
    /** @brief submodule 路径元数据 / Filesystem metadata for the submodule path. */
    const submoduleStat = await stat(submoduleRoot)
    if (!submoduleStat.isDirectory()) throw new Error('not a directory')
  } catch {
    throw new ContractCheckError(
      'submodule-uninitialized',
      `${submodulePath} 未初始化；请运行 git submodule update --init --recursive。 / ` +
        `${submodulePath} is not initialized; run git submodule update --init --recursive.`
    )
  }

  /** @brief Git 识别的 submodule 工作树根 / Submodule worktree root reported by Git. */
  let reportedRoot
  try {
    reportedRoot = await runGit(submoduleRoot, ['rev-parse', '--show-toplevel'])
  } catch {
    throw new ContractCheckError(
      'submodule-uninitialized',
      `${submodulePath} 不是已初始化的独立 Git 工作树；请运行 git submodule update --init --recursive。 / ` +
        `${submodulePath} is not an initialized, independent Git worktree; run git submodule update --init --recursive.`
    )
  }

  /** @brief 文件系统解析后的 submodule 根 / Filesystem-resolved submodule root. */
  const canonicalSubmoduleRoot = await realpath(submoduleRoot)
  /** @brief 文件系统解析后的 Git 工作树根 / Filesystem-resolved Git worktree root. */
  const canonicalReportedRoot = await realpath(reportedRoot)
  if (canonicalReportedRoot !== canonicalSubmoduleRoot) {
    throw new ContractCheckError(
      'submodule-uninitialized',
      `${submodulePath} 未形成独立 Git 工作树，Git 向上解析到了 ${reportedRoot}；请初始化 submodule。 / ` +
        `${submodulePath} is not an independent Git worktree (Git resolved ${reportedRoot}); initialize the submodule.`
    )
  }

  for (const entry of REQUIRED_CONTRACT_ENTRIES) {
    /** @brief 当前必需契约入口绝对路径 / Absolute path of the current required contract entry. */
    const entryPath = path.join(submoduleRoot, entry)
    try {
      /** @brief 当前契约入口元数据 / Filesystem metadata for the current contract entry. */
      const entryStat = await stat(entryPath)
      if (!entryStat.isFile()) throw new Error('not a file')
    } catch {
      throw new ContractCheckError(
        'contract-entry-missing',
        `缺少唯一事实来源中的必需契约入口 ${submodulePath}/${entry}。 / ` +
          `Required contract entry ${submodulePath}/${entry} is missing from the single source of truth.`
      )
    }
  }

  /** @brief submodule 工作树状态 / Submodule worktree status. */
  const status = await runGit(submoduleRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status !== '') {
    throw new ContractCheckError(
      'submodule-dirty',
      `${submodulePath} 存在本地修改；禁止代用户清理或继续消费：\n${status}\n` +
        `${submodulePath} has local changes; do not clean them for the user or continue consuming it.`
    )
  }

  /** @brief submodule 当前 HEAD / Current submodule HEAD. */
  const head = await runGit(submoduleRoot, ['rev-parse', 'HEAD'])
  if (head !== pinnedRevision) {
    throw new ContractCheckError(
      'revision-mismatch',
      `${submodulePath} HEAD (${head}) 与父仓库 gitlink (${pinnedRevision}) 不一致；` +
        `请运行 git submodule update --init --recursive。 / ${submodulePath} HEAD (${head}) ` +
        `does not match the parent gitlink (${pinnedRevision}); run git submodule update --init --recursive.`
    )
  }

  return { head, requiredEntries: REQUIRED_CONTRACT_ENTRIES, submodulePath }
}

/**
 * @brief 解析 CLI 参数 / Parse CLI arguments.
 * @param {string[]} cliArguments CLI 参数 / CLI arguments.
 * @return {{rootDir: string, submodulePath: string}} 解析后的选项 / Parsed options.
 */
function parseArguments(cliArguments) {
  /** @brief CLI 解析结果 / Parsed CLI result. */
  const options = { rootDir: process.cwd(), submodulePath: DEFAULT_SUBMODULE_PATH }

  for (let index = 0; index < cliArguments.length; index += 1) {
    /** @brief 当前 CLI 参数 / Current CLI argument. */
    const argument = cliArguments[index]
    /** @brief 当前参数的值 / Value associated with the current argument. */
    const value = cliArguments[index + 1]

    if (argument === '--root' && value !== undefined) {
      options.rootDir = value
      index += 1
      continue
    }
    if (argument === '--submodule' && value !== undefined) {
      options.submodulePath = value
      index += 1
      continue
    }
    throw new ContractCheckError(
      'argument-invalid',
      `不支持或缺少值的参数：${argument}。 / Unsupported argument or missing value: ${argument}.`
    )
  }

  return options
}

/**
 * @brief 执行契约门禁 CLI / Run the contract-gate CLI.
 * @param {string[]} cliArguments CLI 参数 / CLI arguments.
 * @return {Promise<void>} 完成 Promise / Completion promise.
 */
async function main(cliArguments) {
  try {
    /** @brief 已验证的共享契约状态 / Verified shared-contract state. */
    const result = await checkContracts(parseArguments(cliArguments))
    process.stdout.write(
      `Contract check passed: ${result.submodulePath} @ ${result.head} (${String(result.requiredEntries.length)} required entries).\n`
    )
  } catch (error) {
    /** @brief 可展示的失败消息 / Displayable failure message. */
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Contract check failed: ${message}\n`)
    process.exitCode = 1
  }
}

/** @brief 当前模块是否为直接执行的 CLI / Whether this module is the directly executed CLI. */
const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main(process.argv.slice(2))
