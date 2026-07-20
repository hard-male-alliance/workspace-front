import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  rendererProtocolHost,
  rendererProtocolScheme,
  resolveRendererFilePath
} from './renderer-protocol'

/** @brief 测试 renderer 构建目录 / Test renderer build directory. */
const rendererDirectory = path.resolve('/opt', 'ai-job-workspace', 'renderer')

describe('resolveRendererFilePath', () => {
  it('只解析受信任 host 下的构建资源', () => {
    expect(
      resolveRendererFilePath(
        `${rendererProtocolScheme}://${rendererProtocolHost}/assets/index.js`,
        rendererDirectory
      )
    ).toBe(path.join(rendererDirectory, 'assets', 'index.js'))
  })

  it('将无扩展名的客户端路由回退到入口文档', () => {
    expect(
      resolveRendererFilePath(
        `${rendererProtocolScheme}://${rendererProtocolHost}/knowledge/source-1/visibility`,
        rendererDirectory
      )
    ).toBe(path.join(rendererDirectory, 'index.html'))
  })

  it('将带根 base 的深层客户端路由资源解析到 renderer 根目录', () => {
    /** @brief 深层客户端路由 URL / Deep client-route URL. */
    const deepRouteUrl = `${rendererProtocolScheme}://${rendererProtocolHost}/knowledge/source-1/visibility`
    /** @brief 入口文档的协议根 base URL / Protocol-root base URL from the entry document. */
    const documentBaseUrl = new URL('/', deepRouteUrl).toString()
    /** @brief 相对资源在根 base 下得到的请求 URL / Request URL for a relative asset under the root base. */
    const assetRequestUrl = new URL('./assets/index.js', documentBaseUrl).toString()

    expect(resolveRendererFilePath(assetRequestUrl, rendererDirectory)).toBe(
      path.join(rendererDirectory, 'assets', 'index.js')
    )
  })

  it('拒绝错误 host 和编码后的目录穿越', () => {
    expect(
      resolveRendererFilePath(`${rendererProtocolScheme}://untrusted/index.html`, rendererDirectory)
    ).toBeUndefined()
    expect(
      resolveRendererFilePath(
        `${rendererProtocolScheme}://${rendererProtocolHost}/%2e%2e/%2e%2e/secret.txt`,
        rendererDirectory
      )
    ).toBeUndefined()
  })
})
