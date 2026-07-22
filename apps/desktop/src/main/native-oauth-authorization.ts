/** @file Electron main 的 native OAuth 授权编排 / Native OAuth authorization orchestration in Electron main. */

import {
  createNativeAuthorizationRequest,
  type AuthorizationScreenHint,
  type NativeAuthorizationTransaction,
  type OfflineAccessConsent,
  type OidcDiscoveryDocument
} from '@ai-job-workspace/product-api-v2/native-oauth'

import {
  bindNativeOAuthLoopbackReceiver,
  NativeOAuthLoopbackCancelledError,
  type BindNativeOAuthLoopbackOptions,
  type BoundNativeOAuthLoopbackReceiver,
  type NativeOAuthLoopbackHost
} from './native-oauth-loopback'
import {
  assertNativeOAuthSystemBrowserUrl,
  NativeOAuthSystemBrowserError,
  openNativeOAuthInSystemBrowser
} from './native-oauth-system-browser'

/** @brief native public-client 授权命令 / Native public-client authorization command. */
export interface NativeOAuthAuthorizationCommand {
  /** @brief Authorization Server 注册的 public client ID / Public client ID registered with the Authorization Server. */
  readonly clientId: string
  /** @brief 已严格验证且钉住的 OIDC discovery / Strictly validated and pinned OIDC discovery. */
  readonly discovery: OidcDiscoveryDocument
  /** @brief Hosted identity 页面提示 / Hosted-identity screen hint. */
  readonly screenHint: AuthorizationScreenHint
  /** @brief 产品请求的 OAuth scopes / OAuth scopes requested by the product. */
  readonly scopes: readonly string[]
  /** @brief `offline_access` 的显式同意状态 / Explicit consent state for `offline_access`. */
  readonly offlineAccessConsent?: OfflineAccessConsent | undefined
}

/** @brief main-process 内安装完整授权结果的应用端口 / Application port that installs a completed grant inside the main process. */
export interface NativeOAuthGrantInstaller {
  /**
   * @brief 交换 code、验证 ID Token 并原子安装 main 会话 / Exchange the code, verify the ID Token, and atomically install the main-process session.
   * @param code 已验证的一次性 authorization code / Validated one-time authorization code.
   * @param transaction 仅驻留 main 内存的 PKCE/OIDC 事务 / PKCE/OIDC transaction retained only in main-process memory.
   * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
   * @return 安装完成时兑现的 Promise / Promise fulfilled after installation.
   * @note 实现不得把 code、verifier、state、nonce 或 token 通过 IPC 返回 renderer / Implementations must not return the code, verifier, state, nonce, or tokens to the renderer through IPC.
   */
  readonly installGrant: (
    code: string,
    transaction: NativeAuthorizationTransaction,
    signal?: AbortSignal
  ) => Promise<void>
}

/** @brief native OAuth 主进程宿主依赖 / Native OAuth main-process host dependencies. */
export interface NativeOAuthAuthorizationDependencies {
  /** @brief 完成授权后安装 main 私有会话的端口 / Port that installs the private main-process session after authorization. */
  readonly grantInstaller: NativeOAuthGrantInstaller
  /** @brief 可替换的 listener factory；生产默认绑定真实 OS 端口 / Replaceable listener factory; production binds a real OS port by default. */
  readonly bindLoopbackReceiver?:
    | ((options?: BindNativeOAuthLoopbackOptions) => Promise<BoundNativeOAuthLoopbackReceiver>)
    | undefined
  /** @brief 可替换的系统浏览器 opener；生产默认使用 Electron shell / Replaceable system-browser opener; production uses Electron shell by default. */
  readonly openAuthorizationUrl?: ((authorizationUrl: string) => Promise<void>) | undefined
  /** @brief 测试或宿主指定的 callback 截止 / Callback deadline selected by tests or the host. */
  readonly callbackTimeoutMilliseconds?: number | undefined
  /** @brief 测试可固定的 loopback host 顺序 / Loopback host order that tests may pin. */
  readonly loopbackHosts?: readonly NativeOAuthLoopbackHost[] | undefined
}

/**
 * @brief 在每个异步边界后把取消规范化为安全领域错误 / Normalize cancellation to a safe domain error after every asynchronous boundary.
 * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
 * @return 无返回值 / No return value.
 */
function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new NativeOAuthLoopbackCancelledError()
}

/**
 * @brief 创建 native factory 输入且不制造 `undefined` 可选字段 / Build native-factory input without materializing undefined optionals.
 * @param command 已验证前仍保持原始值的授权命令 / Authorization command whose values remain untrusted until the factory validates them.
 * @param origin OS 已绑定的 loopback origin / OS-bound loopback origin.
 * @return native factory 输入 / Native-factory input.
 */
function nativeAuthorizationOptions(command: NativeOAuthAuthorizationCommand, origin: string) {
  return {
    boundLoopbackOrigin: origin,
    clientId: command.clientId,
    discovery: command.discovery,
    ...(command.offlineAccessConsent === undefined
      ? {}
      : { offlineAccessConsent: command.offlineAccessConsent }),
    scopes: command.scopes,
    screenHint: command.screenHint
  }
}

/**
 * @brief 通过系统浏览器完成一次不向 renderer 暴露秘密的 native OAuth 授权 / Complete one system-browser native OAuth authorization without exposing secrets to the renderer.
 * @param command public client、scope 与 hosted 页面意图 / Public client, scopes, and hosted-page intent.
 * @param dependencies main listener、系统浏览器与授权安装端口 / Main-process listener, system browser, and grant-installation port.
 * @param signal 可选用户取消或应用关闭信号 / Optional user-cancellation or application-shutdown signal.
 * @return main 私有会话安装完成时兑现的 Promise / Promise fulfilled after the private main-process session is installed.
 * @note 顺序不可交换：OS 必须先 `bind(port=0)`，随后 factory 才能把实际端口与随机 path 绑定进 PKCE transaction / Ordering is invariant: the OS first binds `port=0`, then the factory binds that port and a random path into the PKCE transaction.
 */
export async function authorizeNativeOAuth(
  command: NativeOAuthAuthorizationCommand,
  dependencies: NativeOAuthAuthorizationDependencies,
  signal?: AbortSignal
): Promise<void> {
  throwIfCancelled(signal)
  /** @brief 生产 listener factory 或测试替身 / Production listener factory or test substitute. */
  const bindReceiver = dependencies.bindLoopbackReceiver ?? bindNativeOAuthLoopbackReceiver
  /** @brief OS 先完成动态端口绑定的 receiver / Receiver whose dynamic OS port is bound first. */
  const receiver = await bindReceiver({
    ...(dependencies.callbackTimeoutMilliseconds === undefined
      ? {}
      : { callbackTimeoutMilliseconds: dependencies.callbackTimeoutMilliseconds }),
    ...(dependencies.loopbackHosts === undefined ? {} : { hosts: dependencies.loopbackHosts }),
    ...(signal === undefined ? {} : { signal })
  })

  try {
    throwIfCancelled(signal)
    /** @brief 绑定实际 origin 后才创建的 PKCE/OIDC 请求 / PKCE/OIDC request created only after binding the actual origin. */
    const request = await createNativeAuthorizationRequest(
      nativeAuthorizationOptions(command, receiver.origin)
    )
    /** @brief 在打开浏览器之前已 armed 的 callback 等待 / Callback wait armed before the browser is opened. */
    const callback = receiver.waitForCallback(request.transaction, signal)
    throwIfCancelled(signal)

    /** @brief Electron shell opener 或测试替身 / Electron-shell opener or test substitute. */
    const openAuthorizationUrl = dependencies.openAuthorizationUrl ?? openNativeOAuthInSystemBrowser
    /** @brief 即使使用测试/宿主 adapter 也先校验的 pinned URL / Pinned URL validated even when a test or host adapter is used. */
    const trustedAuthorizationUrl = assertNativeOAuthSystemBrowserUrl(request.authorizationUrl)
    /** @brief 捕获同步与异步 opener 失败且从不产生游离 rejection / Browser-launch task capturing synchronous and asynchronous failures without a detached rejection. */
    const browserLaunch = Promise.resolve().then(async (): Promise<void> => {
      throwIfCancelled(signal)
      await openAuthorizationUrl(trustedAuthorizationUrl)
    })
    /** @brief 不抛出的 browser-launch 终态 / Non-throwing browser-launch terminal result. */
    const browserLaunchResult = browserLaunch.then(
      (): { readonly kind: 'opened' } => ({ kind: 'opened' }),
      (error: unknown): { readonly error: unknown; readonly kind: 'failed' } => ({
        error,
        kind: 'failed'
      })
    )
    /** @brief opener 完成或可信 callback 先到达的竞争结果 / Race result for browser launch versus a trusted callback arriving first. */
    const first = await Promise.race([
      browserLaunchResult,
      callback.then((): { readonly kind: 'callback' } => ({ kind: 'callback' }))
    ])
    if (first.kind === 'failed') {
      receiver.cancel()
      await callback.catch((): undefined => undefined)
      if (first.error instanceof NativeOAuthLoopbackCancelledError) throw first.error
      throw new NativeOAuthSystemBrowserError()
    }

    /** @brief 只含已校验 code 的 callback 结果 / Callback result containing only a validated code. */
    const { code } = await callback
    throwIfCancelled(signal)
    await dependencies.grantInstaller.installGrant(code, request.transaction, signal)
  } finally {
    receiver.cancel()
  }
}
