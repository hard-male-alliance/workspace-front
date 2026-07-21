/** @file Electron renderer、preload 与 IPC 的受控 smoke 验证 / Controlled smoke verification for Electron renderer, preload, and IPC. */

import type { BrowserWindow } from 'electron'

import { rendererProtocolHost, rendererProtocolScheme } from './renderer-protocol'

/** @brief 受控 smoke 检查的环境开关 / Environment switch for the controlled smoke check. */
export const desktopSmokeEnvironmentKey = 'AI_JOB_WORKSPACE_SMOKE'

/** @brief renderer smoke 检查的返回数据 / Renderer smoke-check result. */
export interface DesktopSmokeResult {
  /** @brief renderer 根节点的文本长度 / Text length of the renderer root element. */
  readonly rootTextLength: number
  /** @brief preload bridge 返回的平台 / Platform returned by the preload bridge. */
  readonly platform: 'electron'
  /** @brief preload bridge 返回的应用版本 / App version returned by the preload bridge. */
  readonly appVersion: string
}

/**
 * @brief 判断是否启用桌面 smoke 模式 / Determine whether desktop smoke mode is enabled.
 * @param environment 主进程环境变量 / Main-process environment variables.
 * @return 环境开关严格等于 `1` 时为 true / True only when the environment switch strictly equals `1`.
 */
export function isDesktopSmokeEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment[desktopSmokeEnvironmentKey] === '1'
}

/**
 * @brief 校验 renderer 返回的 smoke 数据 / Validate smoke data returned by the renderer.
 * @param result 未受信任的 executeJavaScript 返回值 / Untrusted value returned by executeJavaScript.
 * @return 经形状与语义校验的 smoke 数据 / Smoke data after shape and semantic validation.
 * @throws 返回值缺字段、无内容或并非 Electron 运行时时抛出 / Throws when fields are missing, content is empty, or runtime is not Electron.
 */
export function parseDesktopSmokeResult(result: unknown): DesktopSmokeResult {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('rootTextLength' in result) ||
    !('platform' in result) ||
    !('appVersion' in result)
  ) {
    throw new Error('Desktop smoke check returned an invalid result.')
  }

  /** @brief 已具备必需字段的候选 smoke 数据 / Candidate smoke data containing the required fields. */
  const smokeResult = result as Record<'appVersion' | 'platform' | 'rootTextLength', unknown>

  if (
    typeof smokeResult.rootTextLength !== 'number' ||
    smokeResult.rootTextLength <= 0 ||
    smokeResult.platform !== 'electron' ||
    typeof smokeResult.appVersion !== 'string' ||
    smokeResult.appVersion.length === 0
  ) {
    throw new Error('Desktop smoke check could not verify renderer content or the preload bridge.')
  }

  return {
    appVersion: smokeResult.appVersion,
    platform: smokeResult.platform,
    rootTextLength: smokeResult.rootTextLength
  }
}

/**
 * @brief 读取 renderer、preload 与 IPC 的 smoke 结果 / Read the renderer, preload, and IPC smoke result.
 * @param window 已加载 renderer 的主窗口 / Main window whose renderer has loaded.
 * @return 经运行时校验的 smoke 数据 / Runtime-validated smoke data.
 * @note 运行时信息由正常 React 渲染路径读取，绝不向 renderer 暴露测试 API / Runtime information is read through the normal React path; no test API is exposed to the renderer.
 */
async function inspectDesktopSmoke(window: BrowserWindow): Promise<DesktopSmokeResult> {
  /** @brief 主进程发起的受控 renderer 检查结果 / Controlled renderer check result initiated by main. */
  const result: unknown = await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000

      async function inspectRenderer() {
        const root = document.getElementById('root')
        const rootTextLength = root?.textContent?.trim().length ?? 0

        const applicationShell = document.querySelector('[data-runtime-platform]')
        const platform = applicationShell?.getAttribute('data-runtime-platform') ?? ''
        const appVersion = applicationShell?.getAttribute('data-runtime-version') ?? ''

        if (rootTextLength > 0 && platform === 'electron' && appVersion.length > 0) {
          try {
            resolve({
              rootTextLength,
              platform,
              appVersion
            })
          } catch (error) {
            reject(error)
          }
          return
        }

        if (Date.now() >= deadline) {
          reject(new Error('Renderer did not mount before the desktop smoke timeout.'))
          return
        }

        globalThis.setTimeout(inspectRenderer, 25)
      }

      void inspectRenderer()
    })
  `)

  return parseDesktopSmokeResult(result)
}

/**
 * @brief 验证 renderer、preload、IPC 与生产深链 / Verify renderer, preload, IPC, and a production deep link.
 * @param window 已加载 renderer 的主窗口 / Main window whose renderer has loaded.
 * @return smoke 检查通过时兑现的 Promise / Promise fulfilled when the smoke check passes.
 * @note 深链检查会验证根路径构建资源在自定义协议下仍能加载 / The deep-link check verifies that root-based build assets still load through the custom protocol.
 */
export async function verifyDesktopSmoke(window: BrowserWindow): Promise<void> {
  /** @brief 根路由的 smoke 数据 / Smoke data from the root route. */
  const rootSmokeResult = await inspectDesktopSmoke(window)
  /** @brief 用于验证相对资源不会逃逸的生产深链 / Production deep link used to verify asset resolution. */
  const deepLinkUrl = `${rendererProtocolScheme}://${rendererProtocolHost}/knowledge/ks_mock_git/visibility`

  await window.loadURL(deepLinkUrl)

  /** @brief 深链重新加载后的 smoke 数据 / Smoke data after a deep-link reload. */
  const deepLinkSmokeResult = await inspectDesktopSmoke(window)

  console.info(
    `Desktop smoke passed: root=${rootSmokeResult.rootTextLength} chars, deep-link=${deepLinkSmokeResult.rootTextLength} chars, platform=${deepLinkSmokeResult.platform}, version=${deepLinkSmokeResult.appVersion}`
  )
}
