import path from 'node:path'

import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses'

/**
 * @brief 桌面制品对每个 Electron V1 Fuse 的显式决策 / Explicit decision for every Electron V1 fuse in desktop artifacts.
 * @note `strictlyRequireAllFuses` 会在 Electron 新增 Fuse 而本表尚未更新时让构建失败 / `strictlyRequireAllFuses` fails the build when Electron adds a fuse before this table is updated.
 */
export const requiredDesktopFuseStates = Object.freeze([
  { option: FuseV1Options.RunAsNode, enabled: false, name: 'RunAsNode' },
  {
    option: FuseV1Options.EnableCookieEncryption,
    enabled: true,
    name: 'EnableCookieEncryption'
  },
  {
    option: FuseV1Options.EnableNodeOptionsEnvironmentVariable,
    enabled: false,
    name: 'EnableNodeOptionsEnvironmentVariable'
  },
  {
    option: FuseV1Options.EnableNodeCliInspectArguments,
    enabled: false,
    name: 'EnableNodeCliInspectArguments'
  },
  {
    option: FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
    enabled: true,
    name: 'EnableEmbeddedAsarIntegrityValidation'
  },
  { option: FuseV1Options.OnlyLoadAppFromAsar, enabled: true, name: 'OnlyLoadAppFromAsar' },
  {
    option: FuseV1Options.LoadBrowserProcessSpecificV8Snapshot,
    enabled: false,
    name: 'LoadBrowserProcessSpecificV8Snapshot'
  },
  {
    option: FuseV1Options.GrantFileProtocolExtraPrivileges,
    enabled: false,
    name: 'GrantFileProtocolExtraPrivileges'
  },
  {
    option: FuseV1Options.WasmTrapHandlers,
    enabled: true,
    name: 'WasmTrapHandlers'
  }
])

/**
 * @brief 生成完整且严格的 Fuse 配置 / Create a complete, strict fuse configuration.
 * @param electronPlatformName electron-builder 平台名 / electron-builder platform name.
 * @return 交给官方 `@electron/fuses` 的配置 / Configuration passed to official `@electron/fuses`.
 */
export function createDesktopFuseConfig(electronPlatformName) {
  /** @brief Fuse 配置对象 / Fuse configuration object. */
  const config = {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin'
  }

  for (const decision of requiredDesktopFuseStates) {
    config[decision.option] = decision.enabled
  }
  return config
}

/**
 * @brief 定位 afterPack 阶段尚未签名的 Electron 目标 / Locate the unsigned Electron target during afterPack.
 * @param context electron-builder afterPack 上下文 / electron-builder afterPack context.
 * @return 应交给 `flipFuses` 的可执行文件或 macOS app bundle / Executable or macOS app bundle passed to `flipFuses`.
 */
export function resolveElectronFuseTarget(context) {
  /** @brief 当前构建平台 / Current build platform. */
  const platform = context?.electronPlatformName
  /** @brief 当前 packager / Current packager. */
  const packager = context?.packager
  /** @brief 当前输出目录 / Current output directory. */
  const appOutDir = context?.appOutDir
  /** @brief 各平台目标后缀 / Target suffix for each platform. */
  const targetSuffix = { darwin: '.app', linux: '', win32: '.exe' }[platform]
  /** @brief Linux 使用单独规范化后的可执行名 / Linux uses its separately normalized executable name. */
  const executableName =
    platform === 'linux' ? packager?.executableName : packager?.appInfo?.productFilename

  if (
    typeof appOutDir !== 'string' ||
    appOutDir.length === 0 ||
    typeof executableName !== 'string' ||
    executableName.length === 0 ||
    targetSuffix === undefined
  ) {
    throw new Error(`Unsupported or incomplete Electron afterPack context for ${String(platform)}.`)
  }

  return path.join(appOutDir, `${executableName}${targetSuffix}`)
}

/**
 * @brief 在代码签名前严格写入全部 Electron Fuse / Strictly write every Electron fuse before code signing.
 * @param context electron-builder afterPack 上下文 / electron-builder afterPack context.
 * @return Fuse 写入完成时兑现的 Promise / Promise fulfilled after all fuses are written.
 */
export default async function applyDesktopFuses(context) {
  /** @brief 本次制品的 Electron 目标 / Electron target for this artifact. */
  const electronTarget = resolveElectronFuseTarget(context)
  await flipFuses(electronTarget, createDesktopFuseConfig(context.electronPlatformName))
}
