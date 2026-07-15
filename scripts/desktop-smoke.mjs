import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createDesktopSmokeLaunch } from './desktop-smoke-launch.mjs'

/** @brief 仓库根目录 / Repository root directory. */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @brief 当前平台的 Electron CLI 文件名 / Electron CLI filename for the current platform. */
const electronCliName = process.platform === 'win32' ? 'electron.cmd' : 'electron'

/** @brief desktop workspace 依赖提供的 Electron CLI / Electron CLI supplied by desktop workspace dependencies. */
const electronCliPath = path.join(
  repositoryRoot,
  'apps',
  'desktop',
  'node_modules',
  '.bin',
  electronCliName
)

/** @brief 已构建的 Electron main 入口 / Built Electron main entrypoint. */
const desktopMainPath = path.join(repositoryRoot, 'apps', 'desktop', 'out', 'main', 'index.js')

/** @brief 已构建的桌面 renderer 入口文档 / Built desktop renderer entry document. */
const desktopRendererHtmlPath = path.join(
  repositoryRoot,
  'apps',
  'desktop',
  'out',
  'renderer',
  'index.html'
)

/** @brief 子进程使用的环境 / Environment used by the child process. */
const smokeEnvironment = { ...process.env, AI_JOB_WORKSPACE_SMOKE: '1' }

delete smokeEnvironment.ELECTRON_RUN_AS_NODE

/** @brief 当前平台适配后的 Electron 启动描述 / Electron launch descriptor adapted to the current platform. */
const desktopSmokeLaunch = createDesktopSmokeLaunch(
  process.platform,
  process.env.ComSpec,
  electronCliPath,
  desktopMainPath
)

/**
 * @brief 运行经过控制的桌面 smoke / Run the controlled desktop smoke check.
 * @return 子进程退出时兑现的 Promise / Promise fulfilled when the child process exits.
 */
async function runDesktopSmoke() {
  /** @brief Electron smoke 子进程 / Electron smoke child process. */
  const child = spawn(desktopSmokeLaunch.command, desktopSmokeLaunch.args, {
    cwd: repositoryRoot,
    env: smokeEnvironment,
    stdio: 'inherit',
    windowsHide: true
  })

  /** @brief 子进程退出码 / Child-process exit code. */
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })

  if (exitCode !== 0) {
    throw new Error(`Desktop smoke failed with exit code ${String(exitCode)}.`)
  }
}

/**
 * @brief 验证生产 renderer 的资源会从协议根路径解析 / Verify production renderer assets resolve from the protocol root.
 * @return 验证完成时兑现的 Promise / Promise fulfilled when validation completes.
 * @note electron-vite 生产构建固定输出相对资源；入口 `base` 标签使其在深层路由中仍从协议根解析。
 */
async function verifyRendererAssetBase() {
  /** @brief 已构建 renderer HTML 内容 / Built renderer HTML content. */
  const rendererHtml = await readFile(desktopRendererHtmlPath, 'utf8')
  /** @brief 是否包含协议根路径资源 / Whether a protocol-root asset reference exists. */
  const hasRootAssetReference = /(?:src|href)="\/assets\//u.test(rendererHtml)
  /** @brief 是否包含协议根 base 标签 / Whether a protocol-root base tag exists. */
  const hasRootDocumentBase = /<base\s+href="\/"\s*\/?\s*>/u.test(rendererHtml)
  /** @brief 是否仍包含相对资源路径 / Whether a relative asset reference remains. */
  const hasRelativeAssetReference = /(?:src|href)="\.\/assets\//u.test(rendererHtml)

  if (!hasRootAssetReference && !(hasRootDocumentBase && hasRelativeAssetReference)) {
    throw new Error(
      'Desktop renderer assets must resolve from the protocol root so production deep links can reload safely.'
    )
  }
}

await verifyRendererAssetBase()
await runDesktopSmoke()
