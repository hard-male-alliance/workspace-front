import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

import { chromium } from 'playwright'

import {
  desktopSmokeApiPath,
  desktopSmokeFramePath,
  startDesktopSmokeApiProbe
} from './desktop-smoke-runner.mjs'

/**
 * @brief 取得一个暂时可用的回环 TCP 端口 / Obtain a temporarily available loopback TCP port.
 * @return 操作系统分配的端口 / Port allocated by the operating system.
 */
async function reserveLoopbackPort() {
  /** @brief 只为分配端口而创建的临时 TCP 服务 / Temporary TCP server used only to allocate a port. */
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  /** @brief 操作系统分配的监听地址 / Listening address allocated by the operating system. */
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Packaged desktop smoke could not reserve a debugging port.')
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
  return address.port
}

/**
 * @brief 在截止时间前连接 packaged Chromium 调试端点 / Connect to the packaged Chromium debugging endpoint before the deadline.
 * @param endpoint Chromium DevTools Protocol HTTP endpoint / Chromium DevTools Protocol HTTP endpoint.
 * @param child Electron 子进程 / Electron child process.
 * @return Playwright 的 CDP 浏览器连接 / Playwright browser connection over CDP.
 */
async function connectToPackagedChromium(endpoint, child) {
  /** @brief 调试端点连接截止时间 / Debugging-endpoint connection deadline. */
  const deadline = Date.now() + 15_000
  /** @brief 最近一次连接失败 / Most recent connection failure. */
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Packaged desktop exited before CDP became ready: ${String(child.exitCode)}.`)
    }
    try {
      return await chromium.connectOverCDP(endpoint)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  throw new Error(
    `Packaged desktop CDP endpoint did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}.`
  )
}

/**
 * @brief 等待 packaged renderer 创建首个页面 / Wait for the packaged renderer's first page.
 * @param browser Playwright 的 CDP 浏览器连接 / Playwright browser connection over CDP.
 * @return 产品 renderer 页面 / Product renderer page.
 */
async function resolvePackagedRendererPage(browser) {
  /** @brief renderer 页面出现的截止时间 / Deadline for the renderer page to appear. */
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    /** @brief CDP 当前暴露的页面 / Pages currently exposed through CDP. */
    const pages = browser.contexts().flatMap((context) => context.pages())
    /** @brief 可信产品协议页面 / Trusted product-protocol page. */
    const rendererPage = pages.find((page) => page.url().startsWith('ai-job-workspace://renderer'))
    if (rendererPage !== undefined) return rendererPage
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Packaged desktop did not expose its trusted renderer page.')
}

/**
 * @brief 读取 renderer 可观察的宿主信息 / Read renderer-observable host information.
 * @param page 产品 renderer 页面 / Product renderer page.
 * @return 根文本长度、平台与版本 / Root text length, platform, and version.
 */
async function inspectPackagedRenderer(page) {
  await page.waitForSelector('[data-runtime-platform="electron"]', { timeout: 10_000 })
  return page.locator('[data-runtime-platform="electron"]').evaluate((element) => ({
    appVersion: element.getAttribute('data-runtime-version') ?? '',
    platform: element.getAttribute('data-runtime-platform') ?? '',
    rootTextLength: element.ownerDocument.getElementById('root')?.textContent?.trim().length ?? 0
  }))
}

/**
 * @brief 等待 renderer 访问本地业务 API / Wait for the renderer to access the local product API.
 * @param apiProbe 本地业务 API 探针 / Local product API probe.
 * @param rendererNetworkEvents renderer 观察到的网络事件 / Network events observed in the renderer.
 * @return 已观察的业务路径 / Observed product path.
 */
async function waitForPackagedApiRequest(apiProbe, rendererNetworkEvents) {
  /** @brief API 请求超时计时器 / API-request timeout timer. */
  let timeout

  try {
    return await Promise.race([
      apiProbe.observedRequest,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                `Packaged renderer did not request ${desktopSmokeApiPath}; API observed ${apiProbe.requestPaths.join(', ') || 'no paths'}; renderer observed ${rendererNetworkEvents.join(', ') || 'no network events'}.`
              )
            ),
          10_000
        )
      })
    ])
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * @brief 通过真实 iframe 验证产品 artifact origin 被 CSP 精确允许 / Verify the product artifact origin is precisely allowed by CSP using a real iframe.
 * @param page 产品 renderer 页面 / Product renderer page.
 * @param apiProbe 本地业务 API 探针 / Local product API probe.
 * @return 已观察到的 artifact 路径 / Observed artifact path.
 */
async function verifyPackagedArtifactFrame(page, apiProbe) {
  /** @brief main 下发 origin 上的 artifact URL / Artifact URL on the origin supplied by main. */
  const artifactUrl = new URL(desktopSmokeFramePath, apiProbe.origin).toString()
  /** @brief 服务端观察 artifact 请求的超时计时器 / Timeout timer for server-side artifact observation. */
  let timeout

  await page.evaluate((url) => {
    /** @brief 只为 CSP smoke 创建的 iframe / Iframe created only for the CSP smoke. */
    const frame = globalThis.document.createElement('iframe')
    frame.dataset.smokeArtifactFrame = 'true'
    frame.src = url
    globalThis.document.body.append(frame)
  }, artifactUrl)

  try {
    return await Promise.race([
      apiProbe.observedFrameRequest,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Packaged renderer did not load artifact frame ${artifactUrl}.`)),
          10_000
        )
      })
    ])
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * @brief 启动并操纵真实 packaged 应用 / Launch and drive the actual packaged application.
 * @param launch packaged 可执行文件、参数和工作目录 / Packaged executable, arguments, and working directory.
 * @return 根路由、深链与 API 观察结果 / Root route, deep link, and API observation results.
 * @note Chromium 调试端口只为该子进程显式启用并绑定回环地址，不改变发布配置。 / The Chromium debugging port is explicitly enabled only for this child process and bound to loopback; release configuration is unchanged.
 */
export async function runPackagedDesktopRuntimeSmoke(launch) {
  /** @brief 受控产品 API 探针 / Controlled product API probe. */
  const apiProbe = await startDesktopSmokeApiProbe()
  /** @brief 临时 Chromium CDP 端口 / Temporary Chromium CDP port. */
  const debuggingPort = await reserveLoopbackPort()
  /** @brief packaged Electron 子进程环境 / Packaged Electron child-process environment. */
  const smokeEnvironment = {
    ...process.env,
    AI_JOB_WORKSPACE_API_BASE_URL: apiProbe.origin
  }

  delete smokeEnvironment.AI_JOB_WORKSPACE_API_HOSTNAME
  delete smokeEnvironment.AI_JOB_WORKSPACE_API_PORT
  delete smokeEnvironment.AI_JOB_WORKSPACE_API_PROTOCOL
  delete smokeEnvironment.AI_JOB_WORKSPACE_SMOKE
  delete smokeEnvironment.ELECTRON_RUN_AS_NODE
  delete smokeEnvironment.NODE_OPTIONS

  /** @brief packaged Electron stdout 文本 / Packaged Electron stdout text. */
  let stdout = ''
  /** @brief packaged Electron stderr 文本 / Packaged Electron stderr text. */
  let stderr = ''
  /** @brief 实际 packaged Electron 子进程 / Actual packaged Electron child process. */
  const child = spawn(
    launch.command,
    [
      ...launch.args,
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${String(debuggingPort)}`
    ],
    {
      cwd: launch.cwd,
      env: smokeEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  )

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    process.stderr.write(chunk)
  })

  /** @brief Playwright 的 Chromium CDP 连接 / Playwright Chromium connection over CDP. */
  let browser

  try {
    browser = await connectToPackagedChromium(`http://127.0.0.1:${String(debuggingPort)}`, child)
    /** @brief packaged 产品 renderer 页面 / Packaged product renderer page. */
    const page = await resolvePackagedRendererPage(browser)
    /** @brief renderer 观察到的产品网络事件 / Product-network events observed in the renderer. */
    const rendererNetworkEvents = []
    /** @brief renderer 控制台与未捕获错误 / Renderer console and uncaught errors. */
    const rendererErrors = []

    page.on('request', (request) => {
      if (request.url().startsWith('http://') || request.url().startsWith('https://')) {
        rendererNetworkEvents.push(`${request.method()} ${request.url()}`)
      }
    })
    page.on('requestfailed', (request) => {
      rendererNetworkEvents.push(
        `FAILED ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.trim()
      )
    })
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        rendererErrors.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => {
      rendererErrors.push(`pageerror: ${error.message}`)
    })
    await page.addInitScript(() => {
      /** @brief smoke 观察到的 fetch 调用 / Fetch calls observed by the smoke. */
      globalThis.__desktopSmokeFetches = []
      /** @brief renderer 原始 fetch 实现 / Renderer original fetch implementation. */
      const originalFetch = globalThis.fetch.bind(globalThis)
      globalThis.fetch = async (...arguments_) => {
        /** @brief 当前 fetch 的字符串地址 / String URL for the current fetch. */
        const input = arguments_[0]
        /** @brief 当前 fetch 的可观察记录 / Observable record for the current fetch. */
        const record = {
          error: '',
          url:
            typeof input === 'object' && input !== null && 'url' in input
              ? String(input.url)
              : String(input)
        }
        globalThis.__desktopSmokeFetches.push(record)
        try {
          return await originalFetch(...arguments_)
        } catch (error) {
          record.error = error instanceof Error ? error.message : String(error)
          throw error
        }
      }
    })
    /** @brief 根路由可观察运行时信息 / Observable runtime information on the root route. */
    const rootResult = await inspectPackagedRenderer(page)
    /** @brief 生产知识可见性深链 / Production knowledge-visibility deep link. */
    const deepLinkUrl = 'ai-job-workspace://renderer/knowledge/ks_mock_git/visibility'
    /** @brief 当前页面的 CDP 会话 / CDP session for the current page. */
    const cdpSession = await page.context().newCDPSession(page)

    /** @brief CDP 返回的导航结果 / Navigation result returned by CDP. */
    const navigationResult = await cdpSession.send('Page.navigate', { url: deepLinkUrl })
    if ('errorText' in navigationResult) {
      throw new Error(`Packaged deep-link navigation failed: ${navigationResult.errorText}.`)
    }
    await page.waitForURL(deepLinkUrl, { timeout: 10_000 })
    await page.waitForLoadState('domcontentloaded')
    await inspectPackagedRenderer(page)
    /** @brief renderer 经正式 adapter 发出的业务 API 路径 / Product API path sent by the renderer through its production adapter. */
    const observedPath = await waitForPackagedApiRequest(apiProbe, rendererNetworkEvents)
    await page.getByRole('table').waitFor({ timeout: 10_000 })
    /** @brief 深链成功加载后的可观察运行时信息 / Observable runtime information after the deep link loads successfully. */
    const deepLinkResult = await inspectPackagedRenderer(page)
    /** @brief 新文档中观察到的 fetch 调用 / Fetch calls observed in the new document. */
    const observedFetches = await page.evaluate(() => globalThis.__desktopSmokeFetches ?? [])
    if (observedFetches.some((request) => request.error.length > 0)) {
      throw new Error(`Packaged renderer fetch failed: ${JSON.stringify(observedFetches)}.`)
    }
    /** @brief 会破坏生产边界的 renderer 错误 / Renderer errors that violate production boundaries. */
    const criticalRendererErrors = rendererErrors.filter(
      (error) => error.startsWith('pageerror:') || error.includes('Content Security Policy')
    )
    if (criticalRendererErrors.length > 0) {
      throw new Error(`Packaged renderer reported errors: ${criticalRendererErrors.join(' | ')}.`)
    }
    /** @brief CSP 允许加载的 artifact frame 路径 / Artifact-frame path allowed by CSP. */
    const observedFramePath = await verifyPackagedArtifactFrame(page, apiProbe)

    if (
      rootResult.rootTextLength <= 0 ||
      deepLinkResult.rootTextLength <= 0 ||
      rootResult.platform !== 'electron' ||
      deepLinkResult.platform !== 'electron' ||
      rootResult.appVersion.length === 0 ||
      deepLinkResult.appVersion !== rootResult.appVersion
    ) {
      throw new Error('Packaged renderer did not expose consistent preload runtime information.')
    }

    console.info(
      `Packaged runtime smoke passed: root=${String(rootResult.rootTextLength)} chars, deep-link=${String(deepLinkResult.rootTextLength)} chars, api=${String(observedPath)}, frame=${String(observedFramePath)}, platform=${deepLinkResult.platform}, version=${deepLinkResult.appVersion}.`
    )
    return { deepLinkResult, observedFramePath, observedPath, rootResult, stderr, stdout }
  } finally {
    if (browser !== undefined) await browser.close().catch(() => undefined)
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await apiProbe.close()
  }
}
