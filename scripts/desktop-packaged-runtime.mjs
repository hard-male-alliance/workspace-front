import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

import { chromium } from 'playwright'

/** @brief smoke 使用但绝不连接的确定性产品 API origin / Deterministic product API origin configured but never contacted by the smoke. */
const DESKTOP_SMOKE_API_ORIGIN = 'https://api.desktop-smoke.invalid'

/** @brief CSP 必须阻止的外部网络地址 / External network URL that CSP must block. */
const BLOCKED_NETWORK_URL = 'https://blocked.desktop-smoke.invalid/csp-probe'

/** @brief main 进程导航策略必须阻止的外部地址 / External URL that the main-process navigation policy must block. */
const BLOCKED_NAVIGATION_URL = 'https://navigation.desktop-smoke.invalid/'

/** @brief renderer 必须允许并回退到入口文档的可信深链 / Trusted deep link that the renderer protocol must serve through the entry document. */
const TRUSTED_DEEP_LINK_URL = 'ai-job-workspace://renderer/startup-boundary/deep-link'

/** @brief 当前桌面组合明确报告的 v2 OAuth 缺失原因 / Explicit v2 OAuth composition reason reported by the current desktop renderer. */
const DESKTOP_OAUTH_BOUNDARY_MESSAGE =
  'Desktop startup is closed until the API v2 system-browser OAuth boundary is available.'

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
    throw new Error('Desktop runtime smoke could not reserve a debugging port.')
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
 * @brief 在截止时间前连接 Electron Chromium 调试端点 / Connect to the Electron Chromium debugging endpoint before the deadline.
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
      throw new Error(`Desktop runtime exited before CDP became ready: ${String(child.exitCode)}.`)
    }
    try {
      return await chromium.connectOverCDP(endpoint)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  throw new Error(
    `Desktop runtime CDP endpoint did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}.`
  )
}

/**
 * @brief 等待 Electron renderer 创建首个可信协议页面 / Wait for Electron to create its first trusted-protocol renderer page.
 * @param browser Playwright 的 CDP 浏览器连接 / Playwright browser connection over CDP.
 * @return 可信 renderer 页面 / Trusted renderer page.
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

  throw new Error('Desktop runtime did not expose its trusted renderer page.')
}

/**
 * @brief 断言页面仍位于唯一可信 renderer 协议与主机 / Assert that a page remains on the sole trusted renderer scheme and host.
 * @param pageUrl 待验证页面 URL / Page URL to validate.
 * @return 无返回值 / No return value.
 */
function assertTrustedRendererUrl(pageUrl) {
  /** @brief 解析后的 renderer URL / Parsed renderer URL. */
  const parsedUrl = new URL(pageUrl)
  if (parsedUrl.protocol !== 'ai-job-workspace:' || parsedUrl.hostname !== 'renderer') {
    throw new Error(`Desktop renderer escaped its trusted custom protocol: ${pageUrl}.`)
  }
}

/**
 * @brief 读取并验证受控宿主启动失败视图 / Inspect and validate the controlled host-startup failure view.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return 可比较的启动失败快照 / Comparable startup-failure snapshot.
 */
async function inspectControlledStartupFailure(page) {
  /** @brief 可访问启动失败区域 / Accessible startup-failure region. */
  const alert = page.getByRole('alert')
  await alert.waitFor({ state: 'visible', timeout: 10_000 })
  /** @brief 向用户显示且不泄漏配置的失败文案 / Configuration-safe failure copy shown to the user. */
  const alertText = (await alert.textContent())?.trim() ?? ''
  /** @brief 启动失败区域中的显式恢复操作数 / Number of explicit recovery actions in the failure region. */
  const actionCount = await alert.getByRole('button').count()
  /** @brief renderer 根节点的可见文本长度 / Visible text length of the renderer root. */
  const rootTextLength = (await page.locator('#root').textContent())?.trim().length ?? 0

  if (!/(?:The application cannot start|应用暂时无法启动)/u.test(alertText)) {
    throw new Error(
      `Desktop renderer did not present the controlled startup failure: ${alertText}.`
    )
  }
  if (actionCount !== 1 || rootTextLength <= 0) {
    throw new Error(
      'Desktop startup failure must expose one explicit reload action and visible copy.'
    )
  }
  assertTrustedRendererUrl(page.url())
  return { actionCount, alertText, rootTextLength, url: page.url() }
}

/**
 * @brief 验证 preload 只暴露运行时信息能力 / Verify that preload exposes only the runtime-information capability.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return 已验证的 bridge 与运行时信息快照 / Validated bridge and runtime-information snapshot.
 */
async function inspectPreloadBoundary(page) {
  /** @brief main world 中可观察的 preload 边界 / Preload boundary observable from the main world. */
  const snapshot = await page.evaluate(async () => {
    /** @brief preload 注入的未知 bridge / Unknown bridge injected by preload. */
    const bridge = globalThis.aiJobWorkspace
    if (typeof bridge !== 'object' || bridge === null) {
      return { kind: 'missing' }
    }

    /** @brief renderer 可枚举的全部 bridge 能力 / Every enumerable bridge capability visible to the renderer. */
    const bridgeKeys = Object.keys(bridge).sort()
    /** @brief 通过固定 IPC 通道取得的运行时信息 / Runtime information obtained through the fixed IPC channel. */
    const runtimeInfo = await bridge.getRuntimeInfo()
    return {
      bridgeKeys,
      kind: 'ready',
      privilegedGlobalTypes: {
        electron: typeof globalThis.electron,
        ipcRenderer: typeof globalThis.ipcRenderer,
        require: typeof globalThis.require
      },
      runtimeInfo
    }
  })

  if (snapshot.kind !== 'ready') {
    throw new Error('Desktop preload bridge is unavailable in the trusted renderer.')
  }
  if (JSON.stringify(snapshot.bridgeKeys) !== JSON.stringify(['getRuntimeInfo'])) {
    throw new Error(
      `Desktop preload exposed unexpected capabilities: ${snapshot.bridgeKeys.join(', ')}.`
    )
  }
  if (Object.values(snapshot.privilegedGlobalTypes).some((value) => value !== 'undefined')) {
    throw new Error('Desktop renderer main world exposes a privileged Electron or Node global.')
  }
  if (
    snapshot.runtimeInfo.platform !== 'electron' ||
    snapshot.runtimeInfo.apiBaseUrl !== DESKTOP_SMOKE_API_ORIGIN ||
    typeof snapshot.runtimeInfo.appVersion !== 'string' ||
    snapshot.runtimeInfo.appVersion.length === 0
  ) {
    throw new Error(
      `Desktop preload returned invalid runtime information: ${JSON.stringify(snapshot)}.`
    )
  }
  return snapshot
}

/**
 * @brief 将实际 CSP 拆为按 directive 索引的 token / Parse an actual CSP into directive-indexed tokens.
 * @param policy Content-Security-Policy header / Content-Security-Policy header.
 * @return directive 到值 token 的映射 / Map from directive to value tokens.
 */
function parseContentSecurityPolicy(policy) {
  /** @brief 已解析的 CSP directive / Parsed CSP directives. */
  const directives = new Map()
  for (const segment of policy.split(';')) {
    /** @brief 当前非空 directive token / Current non-empty directive tokens. */
    const tokens = segment.trim().split(/\s+/u).filter(Boolean)
    if (tokens.length === 0) continue
    /** @brief 当前 directive 名称 / Current directive name. */
    const [name, ...values] = tokens
    if (directives.has(name)) {
      throw new Error(`Desktop CSP repeats directive ${name}.`)
    }
    directives.set(name, values)
  }
  return directives
}

/**
 * @brief 验证实际入口响应 CSP 与浏览器执行阻断 / Verify the actual entry-response CSP and browser-enforced blocking.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return CSP header 与阻断结果 / CSP header and blocking result.
 */
async function verifyContentSecurityPolicy(page) {
  /** @brief 通过已注册自定义协议重新读取入口响应的结果 / Result of re-fetching the entry response through the registered custom protocol. */
  const entryResponse = await page.evaluate(async () => {
    /** @brief 同源入口响应 / Same-origin entry response. */
    const response = await fetch('/index.html', { cache: 'no-store' })
    return {
      contentSecurityPolicy: response.headers.get('content-security-policy') ?? '',
      status: response.status
    }
  })
  if (entryResponse.status !== 200 || entryResponse.contentSecurityPolicy.length === 0) {
    throw new Error(`Desktop entry response is missing its CSP: ${JSON.stringify(entryResponse)}.`)
  }

  /** @brief 实际 CSP directive 映射 / Actual CSP directive map. */
  const directives = parseContentSecurityPolicy(entryResponse.contentSecurityPolicy)
  /** @brief 当前 fail-closed renderer 所需的精确 directive / Exact directives required by the current fail-closed renderer. */
  const expectedDirectives = new Map([
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-src', [DESKTOP_SMOKE_API_ORIGIN]],
    ['form-action', ["'self'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", DESKTOP_SMOKE_API_ORIGIN]],
    ['media-src', ["'self'", 'blob:']],
    ['worker-src', ["'self'", 'blob:']]
  ])

  if (directives.size !== expectedDirectives.size) {
    throw new Error(
      `Desktop CSP has an unexpected directive set: ${entryResponse.contentSecurityPolicy}.`
    )
  }
  for (const [name, expectedValues] of expectedDirectives) {
    /** @brief 当前 directive 的实际值 / Actual values of the current directive. */
    const actualValues = directives.get(name)
    if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
      throw new Error(
        `Desktop CSP directive ${name} is ${JSON.stringify(actualValues)}, expected ${JSON.stringify(expectedValues)}.`
      )
    }
  }

  /** @brief 浏览器对 CSP 外连接的实际判别 / Browser's actual disposition of a connection outside CSP. */
  const blockedConnection = await page.evaluate(async (url) => {
    /** @brief 浏览器发出的 CSP 违规事件 / CSP violation event emitted by the browser. */
    const violation = new Promise((resolve) => {
      /** @brief 等待 CSP 事件的有界计时器 / Bounded timer for the CSP event. */
      const timeout = setTimeout(() => resolve(null), 1_000)
      globalThis.document.addEventListener(
        'securitypolicyviolation',
        (event) => {
          clearTimeout(timeout)
          resolve({ blockedUri: event.blockedURI, effectiveDirective: event.effectiveDirective })
        },
        { once: true }
      )
    })
    /** @brief fetch 是否被浏览器拒绝 / Whether the browser rejected fetch. */
    let blocked = false
    /** @brief fetch 拒绝值名称 / Name of the fetch rejection. */
    let errorName = ''
    try {
      await fetch(url)
    } catch (error) {
      blocked = true
      errorName = error instanceof Error ? error.name : typeof error
    }
    return { blocked, errorName, violation: await violation }
  }, BLOCKED_NETWORK_URL)
  if (
    !blockedConnection.blocked ||
    blockedConnection.violation?.effectiveDirective !== 'connect-src' ||
    blockedConnection.violation.blockedUri !== BLOCKED_NETWORK_URL
  ) {
    throw new Error('Desktop CSP allowed a connection outside its explicit connect-src origins.')
  }

  return { ...entryResponse, blockedConnection }
}

/**
 * @brief 验证 Chromium 权限默认拒绝 / Verify default denial of Chromium permissions.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return geolocation 权限状态 / Geolocation permission state.
 */
async function verifyDefaultPermissionDenial(page) {
  /** @brief 通过真实 Permissions API 观察的权限状态 / Permission state observed through the real Permissions API. */
  const permissionState = await page.evaluate(async () => {
    /** @brief geolocation 权限查询结果 / Geolocation permission query result. */
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  })
  if (permissionState !== 'denied') {
    throw new Error(`Desktop permission policy did not deny geolocation: ${permissionState}.`)
  }
  return permissionState
}

/**
 * @brief 验证新窗口和越界主 frame 导航均被拒绝 / Verify denial of both new windows and out-of-scope main-frame navigation.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return 弹窗与导航的可观察结果 / Observable popup and navigation results.
 */
async function verifyPopupAndNavigationDenial(page) {
  /** @brief 弹窗尝试前的页面数 / Page count before the popup attempt. */
  const pagesBeforePopup = page.context().pages().length
  /** @brief window.open 返回值是否为空 / Whether window.open returned null. */
  const popupReturnedNull = await page.evaluate(
    (url) => globalThis.open(url, '_blank') === null,
    BLOCKED_NAVIGATION_URL
  )
  await page.waitForTimeout(100)
  /** @brief 弹窗尝试后的页面数 / Page count after the popup attempt. */
  const pagesAfterPopup = page.context().pages().length
  if (!popupReturnedNull || pagesAfterPopup !== pagesBeforePopup) {
    throw new Error('Desktop main process allowed an unexpected new renderer window.')
  }

  /** @brief 越界导航尝试前的可信 URL / Trusted URL before the out-of-scope navigation attempt. */
  const trustedUrl = page.url()
  await page.evaluate((url) => {
    globalThis.location.assign(url)
  }, BLOCKED_NAVIGATION_URL)
  await page.waitForTimeout(250)
  if (page.url() !== trustedUrl) {
    throw new Error(`Desktop main frame escaped to an untrusted URL: ${page.url()}.`)
  }

  return { pagesAfterPopup, popupReturnedNull, trustedUrl }
}

/**
 * @brief 通过 CDP 导航到同 host 的可信深链 / Navigate through CDP to a trusted same-host deep link.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return 深链 URL / Deep-link URL.
 */
async function navigateToTrustedDeepLink(page) {
  /** @brief 当前页面的 CDP 会话 / CDP session for the current page. */
  const cdpSession = await page.context().newCDPSession(page)
  /** @brief CDP 返回的导航结果 / Navigation result returned by CDP. */
  const navigationResult = await cdpSession.send('Page.navigate', { url: TRUSTED_DEEP_LINK_URL })
  if ('errorText' in navigationResult) {
    throw new Error(`Packaged trusted deep-link navigation failed: ${navigationResult.errorText}.`)
  }
  await page.waitForURL(TRUSTED_DEEP_LINK_URL, { timeout: 10_000 })
  await page.waitForLoadState('domcontentloaded')
  return TRUSTED_DEEP_LINK_URL
}

/**
 * @brief 启动并操纵真实 packaged 应用 / Launch and drive the actual packaged application.
 * @param launch packaged 可执行文件、参数和工作目录 / Packaged executable, arguments, and working directory.
 * @return 受控失败、preload 与安全边界的观察结果 / Observations of controlled failure, preload, and security boundaries.
 * @note Chromium 调试端口只为该子进程显式启用并绑定回环地址，不改变发布配置。 / The Chromium debugging port is explicitly enabled only for this child process and bound to loopback; release configuration is unchanged.
 */
export async function runDesktopRuntimeSmoke(launch) {
  /** @brief 临时 Chromium CDP 端口 / Temporary Chromium CDP port. */
  const debuggingPort = await reserveLoopbackPort()
  /** @brief packaged Electron 子进程环境 / Packaged Electron child-process environment. */
  const smokeEnvironment = {
    ...process.env,
    AI_JOB_WORKSPACE_API_BASE_URL: DESKTOP_SMOKE_API_ORIGIN
  }

  delete smokeEnvironment.AI_JOB_WORKSPACE_API_HOSTNAME
  delete smokeEnvironment.AI_JOB_WORKSPACE_API_PORT
  delete smokeEnvironment.AI_JOB_WORKSPACE_API_PROTOCOL
  delete smokeEnvironment.AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME
  delete smokeEnvironment.AI_JOB_WORKSPACE_DIAGNOSTICS_PORT
  delete smokeEnvironment.AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL
  delete smokeEnvironment.ELECTRON_RENDERER_URL
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
    /** @brief packaged 可信 renderer 页面 / Packaged trusted renderer page. */
    const page = await resolvePackagedRendererPage(browser)
    /** @brief renderer 发出的 HTTP(S) 网络事件 / HTTP(S) network events emitted by the renderer. */
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

    /** @brief 根入口上的受控失败快照 / Controlled-failure snapshot on the root entry. */
    const rootResult = await inspectControlledStartupFailure(page)
    /** @brief 根入口上的 preload 能力快照 / Preload capability snapshot on the root entry. */
    const rootPreload = await inspectPreloadBoundary(page)
    /** @brief 入口响应与浏览器 CSP 执行结果 / Entry-response and browser CSP enforcement result. */
    const contentSecurityPolicy = await verifyContentSecurityPolicy(page)
    /** @brief 权限默认拒绝结果 / Default permission-denial result. */
    const permissionState = await verifyDefaultPermissionDenial(page)
    /** @brief 弹窗与越界导航拒绝结果 / Popup and out-of-scope navigation-denial result. */
    const navigationDenial = await verifyPopupAndNavigationDenial(page)

    await navigateToTrustedDeepLink(page)
    /** @brief 可信深链上的受控失败快照 / Controlled-failure snapshot on the trusted deep link. */
    const deepLinkResult = await inspectControlledStartupFailure(page)
    /** @brief 可信深链上的 preload 能力快照 / Preload capability snapshot on the trusted deep link. */
    const deepLinkPreload = await inspectPreloadBoundary(page)

    /** @brief 除受控 CSP 负向探针外的网络事件 / Network events other than the controlled negative CSP probe. */
    const unexpectedNetworkEvents = rendererNetworkEvents.filter(
      (event) => !event.includes(BLOCKED_NETWORK_URL)
    )
    if (unexpectedNetworkEvents.length > 0) {
      throw new Error(
        `Fail-closed desktop renderer emitted unexpected HTTP(S) traffic: ${unexpectedNetworkEvents.join(' | ')}.`
      )
    }

    /** @brief 除受控 CSP 负向探针外的关键 renderer 错误 / Critical renderer errors excluding the controlled negative CSP probe. */
    const criticalRendererErrors = rendererErrors.filter(
      (error) =>
        error.startsWith('pageerror:') ||
        (error.includes('Content Security Policy') && !error.includes(BLOCKED_NETWORK_URL))
    )
    if (criticalRendererErrors.length > 0) {
      throw new Error(`Packaged renderer reported errors: ${criticalRendererErrors.join(' | ')}.`)
    }
    if (!rendererErrors.some((error) => error.includes(DESKTOP_OAUTH_BOUNDARY_MESSAGE))) {
      throw new Error(
        'Desktop renderer did not report its explicit API v2 OAuth composition boundary.'
      )
    }
    if (deepLinkPreload.runtimeInfo.appVersion !== rootPreload.runtimeInfo.appVersion) {
      throw new Error(
        'Desktop preload returned inconsistent runtime information after a deep link.'
      )
    }

    console.info(
      `Desktop runtime smoke passed: root=${String(rootResult.rootTextLength)} chars, deep-link=${deepLinkResult.url}, bridge=${rootPreload.bridgeKeys.join(',')}, CSP=${String(contentSecurityPolicy.contentSecurityPolicy.length)} chars, permission=${permissionState}, popup-pages=${String(navigationDenial.pagesAfterPopup)}, OAuth=v2-fail-closed.`
    )
    return {
      contentSecurityPolicy,
      deepLinkPreload,
      deepLinkResult,
      navigationDenial,
      permissionState,
      rootPreload,
      rootResult,
      stderr,
      stdout
    }
  } finally {
    if (browser !== undefined) await browser.close().catch(() => undefined)
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}
