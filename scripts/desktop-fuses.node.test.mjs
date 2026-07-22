import path from 'node:path'

import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { describe, expect, it } from 'vitest'

import {
  createDesktopFuseConfig,
  requiredDesktopFuseStates,
  resolveElectronFuseTarget
} from '../apps/desktop/scripts/desktop-fuses.mjs'

describe('desktop fuse build hook', () => {
  it('为当前 schema 的每个 V1 Fuse 提供严格且唯一的决策', () => {
    /** @brief 当前依赖认识的 Fuse 索引 / Fuse indexes known by the current dependency. */
    const knownOptions = Object.values(FuseV1Options).filter((value) => typeof value === 'number')
    /** @brief 仓库显式配置的 Fuse 索引 / Fuse indexes explicitly configured by the repository. */
    const configuredOptions = requiredDesktopFuseStates.map((decision) => decision.option)
    /** @brief Linux 制品所用严格配置 / Strict configuration used for a Linux artifact. */
    const config = createDesktopFuseConfig('linux')

    expect(new Set(configuredOptions)).toEqual(new Set(knownOptions))
    expect(configuredOptions).toHaveLength(knownOptions.length)
    expect(config.version).toBe(FuseVersion.V1)
    expect(config.strictlyRequireAllFuses).toBe(true)
    expect(config.resetAdHocDarwinSignature).toBe(false)
    for (const decision of requiredDesktopFuseStates) {
      expect(config[decision.option]).toBe(decision.enabled)
    }
  })

  it('只为 macOS 请求移除解包二进制的临时签名', () => {
    expect(createDesktopFuseConfig('darwin').resetAdHocDarwinSignature).toBe(true)
    expect(createDesktopFuseConfig('win32').resetAdHocDarwinSignature).toBe(false)
  })

  it.each([
    ['linux', '/release/linux-unpacked', 'ai-job-workspace'],
    ['win32', 'C:/release/win-unpacked', 'AI Job Workspace.exe'],
    ['darwin', '/release/mac-arm64', 'AI Job Workspace.app']
  ])('定位 %s 目标', (platform, appOutDir, expectedName) => {
    expect(
      resolveElectronFuseTarget({
        appOutDir,
        electronPlatformName: platform,
        packager: {
          appInfo: { productFilename: 'AI Job Workspace' },
          executableName: 'ai-job-workspace'
        }
      })
    ).toBe(path.join(appOutDir, expectedName))
  })

  it('拒绝未知平台或不完整上下文', () => {
    expect(() => resolveElectronFuseTarget({ electronPlatformName: 'freebsd' })).toThrow(
      'Unsupported or incomplete'
    )
  })
})
