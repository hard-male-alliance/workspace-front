import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createDesktopSmokeLaunch } from './desktop-smoke-launch.mjs'
import { runDesktopSmokeProcess } from './desktop-smoke-runner.mjs'

/** @brief 仓库根目录 / Repository root directory. */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @brief desktop workspace 依赖提供的 Electron CLI 脚本 / Electron CLI script supplied by desktop workspace dependencies. */
const electronCliScriptPath = path.join(
  repositoryRoot,
  'apps',
  'desktop',
  'node_modules',
  'electron',
  'cli.js'
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
await runDesktopSmokeProcess({
  ...createDesktopSmokeLaunch(process.execPath, electronCliScriptPath, desktopMainPath),
  cwd: repositoryRoot
})
