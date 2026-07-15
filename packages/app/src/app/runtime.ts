import { useEffect, useState } from 'react'
import { APPLICATION_VERSION, createWebPlatformBridge } from '@ai-job-workspace/platform'
import type { PlatformBridge, RuntimeInfo } from '@ai-job-workspace/platform'

/** @brief 浏览器宿主的稳定平台桥接 / Stable platform bridge for the web host. */
const webPlatformBridge = createWebPlatformBridge(APPLICATION_VERSION)

/**
 * @brief 选择当前 renderer 可使用的平台桥接 / Select the platform bridge available to the current renderer.
 * @return Electron preload 注入的窄桥接，或浏览器安全回退桥接 / The narrow Electron-preload bridge, or the safe web fallback bridge.
 * @note 此处只读取 `window.aiJobWorkspace`；不会向 renderer 暴露 Node.js API。
 */
function resolvePlatformBridge(): PlatformBridge {
  return window.aiJobWorkspace ?? webPlatformBridge
}

/**
 * @brief 读取主进程确认的运行时信息 / Read runtime information confirmed by the host.
 * @return 已确认的信息；请求期间或失败时为 undefined / Confirmed information, or undefined while pending or after failure.
 */
export function useRuntimeInfo(): RuntimeInfo | undefined {
  /** @brief 当前已确认的运行时信息 / Currently confirmed runtime information. */
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | undefined>()

  useEffect((): (() => void) => {
    /** @brief effect 是否仍然有效 / Whether the effect remains active. */
    let active = true

    void resolvePlatformBridge()
      .getRuntimeInfo()
      .then((nextRuntimeInfo): void => {
        if (active) {
          setRuntimeInfo(nextRuntimeInfo)
        }
      })
      .catch((): void => {
        if (active) {
          setRuntimeInfo(undefined)
        }
      })

    return (): void => {
      active = false
    }
  }, [])

  return runtimeInfo
}
