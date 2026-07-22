# Electron 桌面部署

Electron 是独立宿主，不是 Web 构建的复制品。main 进程负责验证公开配置、限制权限、注册受限 renderer 协议和授权 IPC；preload 只暴露 `getRuntimeInfo()`。当前 renderer 读取并核对该最小运行时信息后，会呈现受控启动失败页，直到 API v2 系统浏览器 OAuth 与主进程 token 生命周期完成组合；它不会在此期间装配业务应用或旧 transport。

## 产品 API 配置

产品 API origin 的校验规则由桌面端与 Web 共享，但桌面环境变量只由 main 进程读取。当前 origin 仅作为经验证的公开运行时配置和 CSP 输入下发，不代表 renderer 已装配业务 adapter。可使用以下两种互斥配置之一：

```dotenv
AI_JOB_WORKSPACE_API_BASE_URL=http://127.0.0.1:8000
```

或：

```dotenv
AI_JOB_WORKSPACE_API_PROTOCOL=https
AI_JOB_WORKSPACE_API_HOSTNAME=api.hmalliances.org
AI_JOB_WORKSPACE_API_PORT=443
```

四项均未配置时使用 `https://api.hmalliances.org`。地址必须是无凭证、path、query 和 fragment 的 origin；公网产品 API 必须使用 HTTPS，明文 HTTP 只允许 `localhost` 或 `127.0.0.1` 本地开发目标。无效配置会令桌面应用安全地启动失败，绝不回退到 Web runtime 或另一套数据组合。main 会使用安全读取的宿主 locale 先显示中/英文脱敏原生错误，再以非零状态结束；未知 locale 与读取失败回退英文，不依赖 renderer i18n。该 origin 经主进程验证后由窄 bridge 下发，并被精确加入 Content Security Policy（CSP）的 `connect-src` 与 PDF `frame-src`；`object-src` 始终为 `none`。

未来由 renderer 访问的目标 API 必须显式允许 `ai-job-workspace://renderer` 的跨源资源共享（Cross-Origin Resource Sharing, CORS）请求；renderer 不发送可信代理断言，也不持有服务端密钥。API v2 受保护资源要求 Bearer token。桌面端仍需实现系统浏览器 Authorization Code + PKCE、严格回环 callback、主进程 refresh-token 安全存储、短期 renderer access-token 能力、刷新轮换与注销清理；完成前不会挂载 Resume、Knowledge 或 Artifact 产品界面，也不会尝试业务请求。

冻结契约同时要求 Electron 在离线时持久保存 Resume operation batch，并在恢复网络后顺序重放。当前桌面端既未装配产品写入，也没有持久 operation outbox，因此不能宣称支持在线或离线编辑。不能在缺少 native 用户主体与登出生命周期时先把含个人信息的 batch 写入共享本地队列；正式实现必须由 main 进程拥有加密存储，按 API origin、用户与 workspace 隔离，并在 409/412 时停止重放、读取权威版本。操作系统安全存储不可用时必须 fail closed；Electron 官方说明 Linux 的 `basic_text` backend 不提供可信加密，不能用作队列密钥保护：[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。该能力与 native OIDC 一同属于桌面发布阻塞项。

## 构建、打包与制品

```bash
pnpm build:desktop             # 生成 electron-vite out/
pnpm smoke:desktop:build       # 从 out/ 验证 main/preload/IPC/renderer/深链与 fail-closed 安全边界
pnpm package                   # 生成当前平台的 unpacked 应用目录
pnpm smoke:desktop:packaged    # 启动 unpacked 二进制并验证 ASAR、Fuses 与同一宿主安全边界
pnpm verify:desktop:package    # 串行执行 package 与 packaged smoke
pnpm dist:desktop              # 生成当前平台原生安装制品
```

两种 smoke 的失败含义不同：build smoke 直接运行开发依赖中的 Electron 与 `out/`，用于快速定位构建或进程边界回归；packaged smoke 只运行 `release/*-unpacked` 中的实际二进制，并从该二进制读取 Fuse wire。两者都通过真实 Chromium 验证受限自定义协议及深链回退、preload 仅暴露 `getRuntimeInfo()`、入口响应携带 main 生成的精确 CSP、CSP 实际阻止越界连接、Chromium 权限默认拒绝、新窗口与越界主 frame 导航被阻止，并确认 renderer 显示当前 API v2 desktop OAuth 尚未组合的受控失败页。smoke 配置一个不会连接的 `.invalid` API origin，仅用于核对 runtime info 与 CSP；它不启动业务服务、不提供任何 API fixture，也不声称产品数据链路可用。

CI 在 Linux、macOS 与 Windows runner 上分别构建并启动当前平台的 unpacked 应用，读取各自真实二进制的 Fuse wire，再执行同一 packaged runtime smoke；Linux 使用隔离的 Xvfb 显示服务。该矩阵覆盖进程边界、打包布局与 fail-closed 安全行为，但不证明 API v2 desktop OAuth 或业务能力已经实现，也不替代签名、公证和安装器级验收。

Renderer 生产输出启用 esbuild minification。当前桌面 bundle 只包含运行时信息读取、诊断与受控启动失败视图；待 API v2 desktop OAuth 完成后，才会重新组合共享产品应用及其按 Resume、Interview、Knowledge 限界上下文划分的异步路由块，不会另造第二份桌面 UI。

生产 HTML 不携带静态 CSP meta，避免它与 main 的动态响应头取交集后错误阻断已验证 origin；自定义协议入口响应头是生产环境的唯一策略来源。开发模式也不会放任无 CSP：main 只对选定的 HTTP(S) Vite origin 主文档注入同一动态策略，其他 origin 与子资源响应不会被放宽。

打包配置只收录 `out/` 与运行所需的 `package.json`，使用 ASAR，并在代码签名前由官方 `@electron/fuses` 严格设置 Electron Fuses：禁用 `RunAsNode`、`NODE_OPTIONS`、Node CLI inspector 及未随当前 Electron runtime 分发的 browser 专用 V8 snapshot；开启 cookie 加密、嵌入式 ASAR 完整性校验并限制只从 ASAR 加载；不授予 `file://` 额外权限；显式保留 WebAssembly trap handlers。配置启用 `strictlyRequireAllFuses`，Electron 新增 Fuse 而仓库尚未逐项决策时会直接令构建失败。packaged smoke 同时要求 `resources/app.asar` 非空、未出现可替代它的 `resources/app/`，归档只含 `out/` 与 `package.json`，并从真实二进制逐项核对当前全部九个 Fuse。Electron 官方说明，分发应用需要专用打包工具，且 Fuses 可移除不需要的 Electron/Node 启动能力：[Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)。

本地生成的未签名制品只供工程验证；smoke 通过不代表制品已签名。面向用户发布必须在对应操作系统 runner 上完成签名，macOS 还应公证。Electron 官方将代码签名视为生产分发的重要环节，也是自动更新的前置条件：[Packaging Your Application](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)。仓库不会伪造自签名或把发布凭据写进配置；证书、身份与密码必须由发布 CI 的外部 secret store 注入，不能写入仓库、renderer 环境或 ASAR。

## 生产安全不变量

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 与 `webSecurity: true` 不得被开发便利性覆盖。
- 生产只加载 `ai-job-workspace://renderer`，开发服务器 URL 在 packaged 应用中无效。
- 所有 Chromium 权限默认拒绝；新增摄像头或麦克风能力必须绑定可信 origin 和明确用户操作。
- IPC 同时校验主窗口 `webContents`、main frame 和精确 renderer URL；不得暴露通用 `send`、`invoke` 或 Electron 对象。
- 桌面 preload 与 main 当前不提供产物下载或原生保存能力。重新引入该能力时必须基于 v2 的身份、Workspace 授权、短期 `download_url` 信任策略与端到端验证单独设计；不得恢复旧 v1 链路，也不能退化成允许主进程抓取任意 HTTPS URL。
- 当前桌面 renderer 不挂载 PDF 预览。重新引入预览时必须把 v2 Artifact `download_url`、Bearer 生命周期、CSP/CORS 与内容隔离作为一条完整数据通道验证，不能把 iframe 导航当作已认证、可审计的下载能力。
- 新窗口、WebView 和越界导航默认拒绝。安全策略与 Electron 官方清单保持对齐：[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)。
