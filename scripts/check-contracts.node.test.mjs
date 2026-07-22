/** @file 共享契约门禁 Node fixture 测试 / Node fixture tests for the shared-contract gate. */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { checkContracts, ContractCheckError } from './check-contracts.mjs'

/** @brief 当前测试脚本目录 / Directory containing this test script. */
const testDirectory = path.dirname(fileURLToPath(import.meta.url))

/** @brief 被测 CLI 脚本绝对路径 / Absolute path of the CLI under test. */
const contractScript = path.join(testDirectory, 'check-contracts.mjs')

/**
 * @typedef {object} ContractFixture
 * @property {string} parentRoot 父仓库根目录 / Parent repository root.
 * @property {string} submoduleRoot submodule 工作树根 / Submodule worktree root.
 * @property {string} pinnedRevision 父仓库固定 revision / Revision pinned by the parent repository.
 */

/**
 * @brief 在指定仓库运行 Git 并返回输出 / Run Git in a repository and return its output.
 * @param {string} directory Git 工作目录 / Git working directory.
 * @param {string[]} gitArguments Git 参数 / Git arguments.
 * @return {string} 去除空白的标准输出 / Trimmed standard output.
 */
function git(directory, gitArguments) {
  return execFileSync('git', ['-C', directory, ...gitArguments], { encoding: 'utf8' }).trim()
}

/**
 * @brief 初始化可提交的测试仓库 / Initialize a committable test repository.
 * @param {string} directory 仓库目录 / Repository directory.
 * @return {void} 无返回值 / No return value.
 */
function initializeRepository(directory) {
  git(directory, ['init', '--quiet'])
  git(directory, ['config', 'user.name', 'Contract Gate Fixture'])
  git(directory, ['config', 'user.email', 'fixture@example.invalid'])
}

/**
 * @brief 创建包含真实 gitlink 与独立嵌套 Git 工作树的 fixture / Create a fixture with a real gitlink and independent nested Git worktree.
 * @param {(fixture: ContractFixture) => Promise<void>} assertion fixture 断言 / Fixture assertion.
 * @return {Promise<void>} 完成 Promise / Completion promise.
 */
async function withContractFixture(assertion) {
  /** @brief 安全创建的父仓库临时根 / Safely created temporary parent root. */
  const parentRoot = await mkdtemp(path.join(tmpdir(), 'workspace-contract-gate-'))
  /** @brief fixture submodule 工作树根 / Fixture submodule worktree root. */
  const submoduleRoot = path.join(parentRoot, 'workspace-shared-docs')

  try {
    await mkdir(submoduleRoot, { recursive: true })
    initializeRepository(parentRoot)
    initializeRepository(submoduleRoot)

    /** @brief fixture 契约目录 / Fixture contract directory. */
    const contractsDirectory = path.join(submoduleRoot, 'contracts', 'v2')
    await mkdir(contractsDirectory, { recursive: true })
    await Promise.all([
      writeFile(path.join(contractsDirectory, 'contract.md'), '# Fixture contract\n', 'utf8'),
      writeFile(path.join(contractsDirectory, 'schema.jsonc'), '{}\n', 'utf8'),
      writeFile(path.join(contractsDirectory, 'examples.jsonc'), '{}\n', 'utf8'),
      writeFile(path.join(contractsDirectory, 'diff.md'), '# Fixture migration\n', 'utf8')
    ])
    git(submoduleRoot, ['add', 'contracts'])
    git(submoduleRoot, ['commit', '--quiet', '-m', 'fixture contract'])

    /** @brief submodule 首个契约 revision / First contract revision in the submodule. */
    const pinnedRevision = git(submoduleRoot, ['rev-parse', 'HEAD'])
    await writeFile(
      path.join(parentRoot, '.gitmodules'),
      '[submodule "workspace-shared-docs"]\n\tpath = workspace-shared-docs\n\turl = ../workspace-shared-docs.git\n',
      'utf8'
    )
    git(parentRoot, ['add', '.gitmodules'])
    git(parentRoot, [
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${pinnedRevision},workspace-shared-docs`
    ])
    git(parentRoot, ['commit', '--quiet', '-m', 'pin contract submodule'])

    await assertion({ parentRoot, pinnedRevision, submoduleRoot })
  } finally {
    await rm(parentRoot, { force: true, recursive: true })
  }
}

/**
 * @brief 捕获并断言契约门禁错误 / Capture and assert a contract-gate error.
 * @param {Promise<unknown>} operation 预期失败的操作 / Operation expected to fail.
 * @param {string} code 预期错误代码 / Expected error code.
 * @return {Promise<ContractCheckError>} 捕获的错误 / Captured error.
 */
async function expectContractError(operation, code) {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(ContractCheckError)
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`Expected contract check to fail with ${code}.`)
}

describe('checkContracts', () => {
  it('接受已初始化、洁净且 revision 精确匹配的契约 submodule', async () => {
    await withContractFixture(async ({ parentRoot, pinnedRevision }) => {
      /** @brief 合法 fixture 的检查结果 / Check result for the valid fixture. */
      const result = await checkContracts({ rootDir: parentRoot })
      expect(result.head).toBe(pinnedRevision)
      expect(result.requiredEntries).toHaveLength(4)
    })
  })

  it('拒绝未初始化的 gitlink 工作树并给出初始化命令', async () => {
    await withContractFixture(async ({ parentRoot, submoduleRoot }) => {
      await rm(submoduleRoot, { force: true, recursive: true })
      /** @brief 未初始化错误 / Uninitialized-submodule error. */
      const error = await expectContractError(
        checkContracts({ rootDir: parentRoot }),
        'submodule-uninitialized'
      )
      expect(error.message).toContain('git submodule update --init --recursive')
    })
  })

  it('拒绝缺失当前契约入口的工作树', async () => {
    await withContractFixture(async ({ parentRoot, submoduleRoot }) => {
      await rm(path.join(submoduleRoot, 'contracts', 'v2', 'schema.jsonc'))
      /** @brief 缺失契约入口错误 / Missing-contract-entry error. */
      const error = await expectContractError(
        checkContracts({ rootDir: parentRoot }),
        'contract-entry-missing'
      )
      expect(error.message).toContain('schema.jsonc')
    })
  })

  it('拒绝含已跟踪或未跟踪修改的 submodule', async () => {
    await withContractFixture(async ({ parentRoot, submoduleRoot }) => {
      await writeFile(path.join(submoduleRoot, 'local-note.txt'), 'do not remove\n', 'utf8')
      /** @brief 脏工作树错误 / Dirty-worktree error. */
      const error = await expectContractError(
        checkContracts({ rootDir: parentRoot }),
        'submodule-dirty'
      )
      expect(error.message).toContain('?? local-note.txt')
      expect(error.message).toContain('禁止代用户清理')
    })
  })

  it('拒绝 submodule HEAD 与父仓库 gitlink 不一致', async () => {
    await withContractFixture(async ({ parentRoot, pinnedRevision, submoduleRoot }) => {
      await writeFile(path.join(submoduleRoot, 'upstream-change.md'), 'next revision\n', 'utf8')
      git(submoduleRoot, ['add', 'upstream-change.md'])
      git(submoduleRoot, ['commit', '--quiet', '-m', 'advance submodule'])
      /** @brief 新的未固定 revision / New revision not pinned by the parent. */
      const advancedRevision = git(submoduleRoot, ['rev-parse', 'HEAD'])
      /** @brief revision 不匹配错误 / Revision-mismatch error. */
      const error = await expectContractError(
        checkContracts({ rootDir: parentRoot }),
        'revision-mismatch'
      )
      expect(error.message).toContain(advancedRevision)
      expect(error.message).toContain(pinnedRevision)
    })
  })

  it('CLI 对合法 fixture 返回零且对失败输出可操作诊断', async () => {
    await withContractFixture(async ({ parentRoot, submoduleRoot }) => {
      /** @brief 合法 fixture 的 CLI 进程 / CLI process for the valid fixture. */
      const validRun = spawnSync(process.execPath, [contractScript, '--root', parentRoot], {
        encoding: 'utf8'
      })
      expect(validRun.status).toBe(0)
      expect(validRun.stdout).toContain('Contract check passed:')

      await writeFile(path.join(submoduleRoot, 'local-note.txt'), 'dirty\n', 'utf8')
      /** @brief 脏 fixture 的 CLI 进程 / CLI process for the dirty fixture. */
      const dirtyRun = spawnSync(process.execPath, [contractScript, '--root', parentRoot], {
        encoding: 'utf8'
      })
      expect(dirtyRun.status).toBe(1)
      expect(dirtyRun.stderr).toContain('Contract check failed:')
      expect(dirtyRun.stderr).toContain('?? local-note.txt')
    })
  })
})
