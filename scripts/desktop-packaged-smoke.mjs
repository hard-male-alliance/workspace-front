import { fileURLToPath } from 'node:url'
import path from 'node:path'

import electronAsar from '@electron/asar'
import { getCurrentFuseWire } from '@electron/fuses'

import {
  createAsarEntryDescriptor,
  measurePathBytes,
  resolvePackagedDesktopLayout,
  verifyPackagedAsar
} from './desktop-packaged-layout.mjs'
import { requiredDesktopFuseStates } from '../apps/desktop/scripts/desktop-fuses.mjs'
import { runDesktopRuntimeSmoke } from './desktop-packaged-runtime.mjs'
import {
  assertProductionArtifactDataBoundary,
  inspectProductionArtifactEntries,
  isProductionArtifactTextPath
} from './check-production-artifacts.mjs'

/** @brief CommonJS `@electron/asar` 导出的归档读取 API / Archive-reading API exported by CommonJS `@electron/asar`. */
const { extractFile, listPackage } = electronAsar
/** @brief Fuse wire 中 ASCII `0` 表示禁用 / ASCII `0` denotes disabled in the fuse wire. */
const disabledFuseState = '0'.charCodeAt(0)
/** @brief Fuse wire 中 ASCII `1` 表示启用 / ASCII `1` denotes enabled in the fuse wire. */
const enabledFuseState = '1'.charCodeAt(0)

/** @brief 仓库根目录 / Repository root directory. */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** @brief desktop workspace 根目录 / Desktop workspace root directory. */
const desktopRoot = path.join(repositoryRoot, 'apps', 'desktop')
/** @brief electron-builder 制品目录 / electron-builder artifact directory. */
const releaseRoot = path.join(desktopRoot, 'release')

/**
 * @brief 验证 ASAR 只包含已 bundle 的输出与最小 metadata / Verify ASAR contains only bundled output and minimal metadata.
 * @param asarPath app.asar 路径 / app.asar path.
 * @return 归档条目数 / Archive entry count.
 */
function verifyPackagedAsarEntries(asarPath) {
  /** @brief 原生提取路径与规范化策略路径 / Native extraction paths and normalized policy paths. */
  const entryDescriptors = listPackage(asarPath).map(createAsarEntryDescriptor)
  /** @brief 平台无关的实际 ASAR 条目 / Platform-independent actual ASAR entries. */
  const entries = entryDescriptors.map(({ logicalPath }) => logicalPath)
  /** @brief 必须存在的关键输出 / Required key outputs. */
  const requiredEntries = [
    '/out/main/index.js',
    '/out/preload/index.cjs',
    '/out/renderer/index.html',
    '/package.json'
  ]
  /** @brief 越过打包边界的意外条目 / Unexpected entries crossing the packaging boundary. */
  const unexpectedEntries = entries.filter(
    (entry) => entry !== '/package.json' && entry !== '/out' && !entry.startsWith('/out/')
  )

  if (unexpectedEntries.length > 0) {
    throw new Error(`Packaged ASAR contains unexpected entries: ${unexpectedEntries.join(', ')}.`)
  }
  for (const requiredEntry of requiredEntries) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Packaged ASAR is missing ${requiredEntry}.`)
    }
  }
  if (!entries.some((entry) => /^\/out\/renderer\/assets\/[^/]+\.js$/u.test(entry))) {
    throw new Error('Packaged ASAR is missing the bundled renderer JavaScript asset.')
  }
  if (entries.some((entry) => entry === '/node_modules' || entry.startsWith('/node_modules/'))) {
    throw new Error('Packaged ASAR must not duplicate bundled node_modules.')
  }

  /** @brief ASAR 中所有可执行前端文本 / All executable frontend texts inside the ASAR. */
  const productionEntries = entryDescriptors
    .filter(({ logicalPath }) => isProductionArtifactTextPath(logicalPath))
    .map(({ archivePath, logicalPath }) => ({
      content: extractFile(asarPath, archivePath),
      path: `app.asar${logicalPath}`
    }))
  /** @brief ASAR 业务数据边界扫描结果 / Business-data boundary result for the ASAR. */
  const dataBoundaryResult = inspectProductionArtifactEntries(productionEntries)
  assertProductionArtifactDataBoundary(dataBoundaryResult, 'packaged Electron app.asar')

  return entries.length
}

/**
 * @brief 验证 packaged Electron 二进制的全部安全 Fuse / Verify every security fuse in the packaged Electron binary.
 * @param executablePath packaged Electron 可执行文件 / Packaged Electron executable.
 * @return 验证完成时兑现的 Promise / Promise fulfilled after verification.
 */
async function verifyPackagedFuses(executablePath) {
  /** @brief 从实际二进制读取的 Fuse wire / Fuse wire read from the actual binary. */
  const fuseWire = await getCurrentFuseWire(executablePath)

  for (const { option, enabled, name } of requiredDesktopFuseStates) {
    /** @brief 配置要求的 Fuse wire 状态 / Fuse wire state required by configuration. */
    const expectedState = enabled ? enabledFuseState : disabledFuseState
    /** @brief 实际 Fuse 状态 / Actual fuse state. */
    const actualState = fuseWire[option]
    if (actualState !== expectedState) {
      throw new Error(
        `Packaged Electron fuse ${name} is ${String(actualState)}, expected ${String(expectedState)}.`
      )
    }
  }
}

/**
 * @brief 以 MiB 格式化字节数 / Format bytes as MiB.
 * @param bytes 需要格式化的字节数 / Byte count to format.
 * @return 保留一位小数的 MiB / MiB with one decimal place.
 */
function formatMebibytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/** @brief 当前平台实际生成的 unpacked 应用布局 / Actual unpacked application layout for the current platform. */
const packagedLayout = await resolvePackagedDesktopLayout(releaseRoot)
/** @brief app.asar 的逻辑字节数 / Logical byte size of app.asar. */
const asarBytes = await verifyPackagedAsar(packagedLayout)
/** @brief app.asar 的条目数 / Number of entries in app.asar. */
const asarEntryCount = verifyPackagedAsarEntries(packagedLayout.asarPath)

await verifyPackagedFuses(packagedLayout.executablePath)
await runDesktopRuntimeSmoke({
  args: [],
  command: packagedLayout.executablePath,
  cwd: packagedLayout.applicationPath
})

/** @brief 整个 unpacked 应用的逻辑字节数 / Logical byte size of the entire unpacked application. */
const applicationBytes = await measurePathBytes(packagedLayout.applicationPath)

console.info(
  `Packaged desktop verified: app=${packagedLayout.applicationPath}, size=${formatMebibytes(applicationBytes)}, asar=${formatMebibytes(asarBytes)}/${String(asarEntryCount)} entries, fuses=${String(requiredDesktopFuseStates.length)}.`
)
