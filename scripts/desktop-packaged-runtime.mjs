import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

/** @brief API STANDARD V2 冻结的生产产品 origin / Frozen production product origin from API STANDARD V2. */
const API_V2_PRODUCTION_ORIGIN = 'https://api.hmalliances.org:8022'

/** @brief smoke 注入但必须被构建期配置忽略的运行时 client ID / Runtime client ID injected by the smoke but required to be ignored by build-time configuration. */
const DESKTOP_RUNTIME_OAUTH_OVERRIDE = 'runtime-override-must-be-ignored'

/** @brief CSP 必须阻止的外部网络地址 / External network URL that CSP must block. */
const BLOCKED_NETWORK_URL = 'https://blocked.desktop-smoke.invalid/csp-probe'

/** @brief main 进程导航策略必须阻止的外部地址 / External URL that the main-process navigation policy must block. */
const BLOCKED_NAVIGATION_URL = 'https://navigation.desktop-smoke.invalid/'

/** @brief renderer 必须允许并回退到入口文档的可信深链 / Trusted deep link that the renderer protocol must serve through the entry document. */
const TRUSTED_DEEP_LINK_URL = 'ai-job-workspace://renderer/startup-boundary/deep-link'

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
 * @brief 读取并验证未进入 Workspace 的 hosted identity 入口 / Inspect and validate the hosted-identity entry before entering the Workspace.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return 可比较的身份入口快照 / Comparable identity-entry snapshot.
 */
async function inspectAuthenticationEntry(page) {
  /** @brief 可访问身份入口标题 / Accessible identity-entry heading. */
  const heading = page.getByRole('heading', {
    name: /(?:Continue to your job workspace|继续你的求职工作区)/u
  })
  await heading.waitFor({ state: 'visible', timeout: 10_000 })
  /** @brief 登录、注册与恢复三个显式入口 / Three explicit sign-in, registration, and recovery entries. */
  const actionCount = await page.getByRole('button').count()
  /** @brief renderer 根节点的可见文本长度 / Visible text length of the renderer root. */
  const rootTextLength = (await page.locator('#root').textContent())?.trim().length ?? 0

  if (actionCount !== 3 || rootTextLength <= 0) {
    throw new Error(
      'Desktop authentication entry must expose three hosted actions and visible copy.'
    )
  }
  assertTrustedRendererUrl(page.url())
  return {
    actionCount,
    headingText: (await heading.textContent())?.trim() ?? '',
    rootTextLength,
    url: page.url()
  }
}

/**
 * @brief 验证 preload 只暴露运行时与封闭认证能力 / Verify that preload exposes only runtime information and closed authentication capabilities.
 * @param page 可信 renderer 页面 / Trusted renderer page.
 * @return 已验证的 bridge、匿名会话与运行时快照 / Validated bridge, anonymous session, and runtime snapshot.
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
    /** @brief renderer 可枚举的封闭认证能力 / Enumerable closed authentication capabilities visible to the renderer. */
    const authenticationKeys = Object.keys(bridge.authentication ?? {}).sort()
    /** @brief renderer 可枚举的封闭 Artifact 保存能力 / Enumerable closed Artifact-save capabilities visible to the renderer. */
    const artifactSaveKeys = Object.keys(bridge.artifactSave ?? {}).sort()
    /** @brief main 启动恢复后的会话投影 / Session projection after main-process startup recovery. */
    const authenticationSession = await bridge.authentication?.getSession()
    /** @brief 通过固定 IPC 通道取得的运行时信息 / Runtime information obtained through the fixed IPC channel. */
    const runtimeInfo = await bridge.getRuntimeInfo()
    return {
      artifactSaveKeys,
      authenticationKeys,
      authenticationSession,
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
  if (
    JSON.stringify(snapshot.bridgeKeys) !==
    JSON.stringify(['artifactSave', 'authentication', 'getRuntimeInfo'])
  ) {
    throw new Error(
      `Desktop preload exposed unexpected capabilities: ${snapshot.bridgeKeys.join(', ')}.`
    )
  }
  if (
    JSON.stringify(snapshot.artifactSaveKeys) !==
    JSON.stringify(['maximumArtifactBytes', 'saveArtifact'])
  ) {
    throw new Error(
      `Desktop preload exposed an invalid Artifact-save boundary: ${snapshot.artifactSaveKeys.join(', ')}.`
    )
  }
  if (
    JSON.stringify(snapshot.authenticationKeys) !==
    JSON.stringify(['authorize', 'getSession', 'refresh', 'signOut'])
  ) {
    throw new Error(
      `Desktop preload exposed an invalid authentication boundary: ${JSON.stringify(snapshot.authenticationSession)}.`
    )
  }
  /** @brief 当前平台期望的启动认证投影 / Startup-authentication projection expected for the current platform. */
  const hasExpectedAuthenticationProjection =
    process.platform === 'linux'
      ? snapshot.authenticationSession?.kind === 'failure' &&
        snapshot.authenticationSession.reason === 'persistent-login-unsupported'
      : snapshot.authenticationSession?.kind === 'success' &&
        snapshot.authenticationSession.session?.kind === 'anonymous'
  if (!hasExpectedAuthenticationProjection) {
    throw new Error(
      `Desktop preload exposed an invalid authentication boundary: ${JSON.stringify(snapshot.authenticationSession)}.`
    )
  }
  if (Object.values(snapshot.privilegedGlobalTypes).some((value) => value !== 'undefined')) {
    throw new Error('Desktop renderer main world exposes a privileged Electron or Node global.')
  }
  if (
    snapshot.runtimeInfo.platform !== 'electron' ||
    snapshot.runtimeInfo.apiBaseUrl !== API_V2_PRODUCTION_ORIGIN ||
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
    ['frame-src', ["'self'", 'blob:']],
    ['form-action', ["'self'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", API_V2_PRODUCTION_ORIGIN]],
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
  /** @brief 与真实安装资料完全隔离的临时 userData / Temporary userData fully isolated from real installations. */
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'ai-job-workspace-desktop-smoke-'))
  /** @brief packaged Electron 子进程环境 / Packaged Electron child-process environment. */
  const smokeEnvironment = {
    ...process.env,
    AI_JOB_WORKSPACE_OAUTH_CLIENT_ID: DESKTOP_RUNTIME_OAUTH_OVERRIDE
  }

  delete smokeEnvironment.AI_JOB_WORKSPACE_API_BASE_URL
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
      `--remote-debugging-port=${String(debuggingPort)}`,
      `--user-data-dir=${userDataDirectory}`
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

    /** @brief 根入口上的身份入口快照 / Identity-entry snapshot on the root entry. */
    const rootResult = await inspectAuthenticationEntry(page)
    /** @brief 根入口上的 preload 能力快照 / Preload capability snapshot on the root entry. */
    const rootPreload = await inspectPreloadBoundary(page)
    /** @brief 入口响应与浏览器 CSP 执行结果 / Entry-response and browser CSP enforcement result. */
    const contentSecurityPolicy = await verifyContentSecurityPolicy(page)
    /** @brief 权限默认拒绝结果 / Default permission-denial result. */
    const permissionState = await verifyDefaultPermissionDenial(page)
    /** @brief 弹窗与越界导航拒绝结果 / Popup and out-of-scope navigation-denial result. */
    const navigationDenial = await verifyPopupAndNavigationDenial(page)

    await navigateToTrustedDeepLink(page)
    /** @brief 可信深链上的身份入口快照 / Identity-entry snapshot on the trusted deep link. */
    const deepLinkResult = await inspectAuthenticationEntry(page)
    /** @brief 可信深链上的 preload 能力快照 / Preload capability snapshot on the trusted deep link. */
    const deepLinkPreload = await inspectPreloadBoundary(page)

    /** @brief 除受控 CSP 负向探针外的网络事件 / Network events other than the controlled negative CSP probe. */
    const unexpectedNetworkEvents = rendererNetworkEvents.filter(
      (event) => !event.includes(BLOCKED_NETWORK_URL)
    )
    if (unexpectedNetworkEvents.length > 0) {
      throw new Error(
        `Unauthenticated desktop renderer emitted unexpected HTTP(S) traffic: ${unexpectedNetworkEvents.join(' | ')}.`
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
    if (deepLinkPreload.runtimeInfo.appVersion !== rootPreload.runtimeInfo.appVersion) {
      throw new Error(
        'Desktop preload returned inconsistent runtime information after a deep link.'
      )
    }

    /** @brief 当前平台的 OAuth smoke 策略 / OAuth smoke policy for the current platform. */
    const oauthPolicy = process.platform === 'linux' ? 'v2-linux-fail-closed' : 'v2-native-ready'
    console.info(
      `Desktop runtime smoke passed: root=${String(rootResult.rootTextLength)} chars, deep-link=${deepLinkResult.url}, bridge=${rootPreload.bridgeKeys.join(',')}, auth=${rootPreload.authenticationKeys.join(',')}, CSP=${String(contentSecurityPolicy.contentSecurityPolicy.length)} chars, permission=${permissionState}, popup-pages=${String(navigationDenial.pagesAfterPopup)}, OAuth=${oauthPolicy}.`
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
    if (child.exitCode === null && child.signalCode === null) {
      /** @brief 等待 Electron 完全释放隔离 profile 后再删除 / Wait for Electron to fully release the isolated profile before deletion. */
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill()
      await exited
    }
    await rm(userDataDirectory, { force: true, recursive: true })
  }
}
