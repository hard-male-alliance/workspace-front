# Electron 桌面部署

Electron 是独立宿主，不是 Web 构建的复制品。main 进程负责验证公开配置、限制权限、注册受限 renderer 协议和授权 IPC；preload 只暴露 `getRuntimeInfo()` 与 typed `saveArtifact()`；renderer 只组合 React 应用与经过验证的公开能力。

## 产品 API 配置

桌面端与 Web 使用同一业务 adapter 集合，但环境变量只由 main 进程读取。可使用以下两种互斥配置之一：

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

目标 API 仍须显式允许 `ai-job-workspace://renderer` 的跨源资源共享（Cross-Origin Resource Sharing, CORS）请求；renderer 不发送可信代理断言，也不持有服务端密钥。共享 HTTP 边界已发送经校验的 `Accept-Language` 与每请求唯一 `X-Request-Id`，但当前配置只建立公开 transport origin，不建立身份：正式契约要求除公开模板预览外使用 Bearer token，而授权端点、client ID、scope、系统浏览器回调、刷新和注销生命周期尚未冻结。因此当前受保护的 Resume、Knowledge 与 PDF content 不能宣称生产认证可用；实现条件见[契约待确认项](contract-open-questions.md)。

冻结契约同时要求 Electron 在离线时持久保存 Resume operation batch，并在恢复网络后顺序重放。当前桌面端没有持久 operation outbox，只提供在线写入与同一 Resume 的进程内互斥，因此不能宣称支持离线编辑。不能在缺少 native 用户主体与登出生命周期时先把含个人信息的 batch 写入共享本地队列；正式实现必须由 main 进程拥有加密存储，按 API origin、用户与 workspace 隔离，并在 409/412 时停止重放、读取权威版本。操作系统安全存储不可用时必须 fail closed；Electron 官方说明 Linux 的 `basic_text` backend 不提供可信加密，不能用作队列密钥保护：[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。该能力与 native OIDC 一同属于桌面发布阻塞项。

## 构建、打包与制品

```bash
pnpm build:desktop             # 生成 electron-vite out/
pnpm smoke:desktop:build       # 从 out/ 验证 main/preload/IPC/renderer/深链
pnpm package                   # 生成当前平台的 unpacked 应用目录
pnpm smoke:desktop:packaged    # 启动 unpacked 二进制并验证 ASAR、Fuses 与无认证 transport fixture
pnpm verify:desktop:package    # 串行执行 package 与 packaged smoke
pnpm dist:desktop              # 生成当前平台原生安装制品
```

两种 smoke 的失败含义不同：build smoke 直接运行开发依赖中的 Electron 与 `out/`，用于快速定位构建或进程边界回归；packaged smoke 只运行 `release/*-unpacked` 中的实际二进制，并从该二进制读取 Fuse wire。packaged smoke 还会启动一个仅监听 `127.0.0.1` 随机端口、明确不要求认证的最小 transport fixture，将其 origin 通过正式 main 配置下发，要求 renderer 的 HTTP adapter 成功读取 `/api/v1/knowledge-sources/ks_smoke_git`，并要求同 origin 的 artifact iframe 被实际请求。因此验证不依赖公网，也没有给 preload 或 renderer 增加测试后门；它只证明宿主、CSP、CORS 与 adapter wiring，绝不证明契约 Bearer 认证。

CI 在 Linux、macOS 与 Windows runner 上分别构建并启动当前平台的 unpacked 应用，读取各自真实二进制的 Fuse wire，再执行同一 packaged runtime smoke；Linux 使用隔离的 Xvfb 显示服务。该矩阵覆盖进程边界与打包布局，但不会绕过原生保存对话框，也不替代签名、公证和安装器级验收。

Renderer 生产输出启用 esbuild minification，并按 Resume、Interview、Knowledge 的限界上下文生成异步路由块；Workspace 壳和首页保持 eager。这个部署切分与源码边界一致，不引入第二份桌面 UI。

生产 HTML 不携带静态 CSP meta，避免它与 main 的动态响应头取交集后错误阻断已验证 origin；自定义协议入口响应头是生产环境的唯一策略来源。开发模式也不会放任无 CSP：main 只对选定的 HTTP(S) Vite origin 主文档注入同一动态策略，其他 origin 与子资源响应不会被放宽。

打包配置只收录 `out/` 与运行所需的 `package.json`，使用 ASAR，并在代码签名前由官方 `@electron/fuses` 严格设置 Electron Fuses：禁用 `RunAsNode`、`NODE_OPTIONS`、Node CLI inspector 及未随当前 Electron runtime 分发的 browser 专用 V8 snapshot；开启 cookie 加密、嵌入式 ASAR 完整性校验并限制只从 ASAR 加载；不授予 `file://` 额外权限；显式保留 WebAssembly trap handlers。配置启用 `strictlyRequireAllFuses`，Electron 新增 Fuse 而仓库尚未逐项决策时会直接令构建失败。packaged smoke 同时要求 `resources/app.asar` 非空、未出现可替代它的 `resources/app/`，归档只含 `out/` 与 `package.json`，并从真实二进制逐项核对当前全部九个 Fuse。Electron 官方说明，分发应用需要专用打包工具，且 Fuses 可移除不需要的 Electron/Node 启动能力：[Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)。

本地生成的未签名制品只供工程验证；smoke 通过不代表制品已签名。面向用户发布必须在对应操作系统 runner 上完成签名，macOS 还应公证。Electron 官方将代码签名视为生产分发的重要环节，也是自动更新的前置条件：[Packaging Your Application](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)。仓库不会伪造自签名或把发布凭据写进配置；证书、身份与密码必须由发布 CI 的外部 secret store 注入，不能写入仓库、renderer 环境或 ASAR。

## 生产安全不变量

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 与 `webSecurity: true` 不得被开发便利性覆盖。
- 生产只加载 `ai-job-workspace://renderer`，开发服务器 URL 在 packaged 应用中无效。
- 所有 Chromium 权限默认拒绝；新增摄像头或麦克风能力必须绑定可信 origin 和明确用户操作。
- IPC 同时校验主窗口 `webContents`、main frame 和精确 renderer URL；不得暴露通用 `send`、`invoke` 或 Electron 对象。
- PDF 保存 IPC 仅接受符合冻结 OpaqueId 的 artifact ID 与安全文件名，不接受 renderer 提供的 URL、大小或摘要。Web、preload 和 main 在各自信任边界均重新调用 `platform` 的同一纯 decoder，不把 preload 校验视为 main 的授权。用户完成保存对话框后，main 使用发送方 `session.fetch(credentials: 'omit', redirect: 'error')` 重新读取 `/api/v1/render-artifacts/{artifact_id}` 的完整权威 metadata，核对身份、PDF 格式、媒体类型与有效期后才立即下载。content URL 必须与已验证产品 API 完全同 origin、精确匹配同一 artifact 的 `/api/v1/render-artifacts/{opaque-id}/content`；metadata 和 content 的任何重定向都由 Chromium 网络栈直接拒绝。请求不携带 Cookie，也不伪造正式契约要求的 Bearer 身份；身份链路冻结前，受保护 metadata/content 的原生保存应明确失败，仍是发布阻塞项。响应只接受 `200 application/pdf`，并显式限定为 Fetch 可解码的 `gzip`/`br`/`deflate`/`zstd` 或缺省/`identity` 内容编码；`Content-Length` 只在缺省/`identity` 编码下用作提前拒绝，实际解码流始终受 25 MiB、`size_bytes` 和 SHA-256 的最终核对，并以统一总时限中止慢响应。
- 契约允许短期签名 `download_url`，但尚未冻结对象存储/CDN origin 与重定向信任清单；因此 Web 与 Electron 当前都 fail closed：只接受上述同源 content 路径并拒绝所有重定向。跨 origin 或重定向产物必须在上游确定 allowlist、认证传播与 CSP/CORS 后显式启用，不能退化成允许主进程抓取任意 HTTPS URL。
- 原生保存使用用户选择目标同目录下的 `0600` 独占临时文件，`fsync` 后尽量以原子 `rename` 完成；取消、超限和写入失败均清理临时文件。renderer 只获得 `saved/cancelled` 判别结果，绝不获得本地文件路径。
- PDF 预览仍由 sandboxed iframe 承载以保持既有界面，但 iframe 导航不等于 main 中可审计的无 Cookie Fetch，也不提供 Bearer token 生命周期。正式身份方案必须单独冻结预览的数据通道；当前 CSP/frame smoke 只证明 origin 约束，不证明认证。
- 新窗口、WebView 和越界导航默认拒绝。安全策略与 Electron 官方清单保持对齐：[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)。
