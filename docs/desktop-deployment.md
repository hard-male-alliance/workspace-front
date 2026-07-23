# Electron 桌面部署

Electron 是独立 OAuth public client 与安全宿主。main 进程拥有系统浏览器授权、RFC 8252 loopback callback、Refresh Token、安全存储与刷新轮换；renderer 只持有短期 Access Token。preload 只暴露封闭的运行时、认证与宿主能力，不暴露通用 IPC、Node.js 或长期凭据。

## 冻结 API v2 目标

生产 transport、运行时信息和 Content Security Policy（CSP）共同引用 `API_V2_PRODUCTION_ORIGIN`，固定为 `https://api.hmalliances.org:8022`。桌面构建不再接受 `AI_JOB_WORKSPACE_API_BASE_URL`、`AI_JOB_WORKSPACE_API_PROTOCOL`、`AI_JOB_WORKSPACE_API_HOSTNAME` 或 `AI_JOB_WORKSPACE_API_PORT`；运行时注入这些旧变量不会改变请求目标，也不会放宽 CSP。

生产 renderer 的 `connect-src` 与 PDF `frame-src` 精确包含该 origin。产品 gateway 只创建 `{ kind: 'production' }` transport profile；受控测试 profile 不进入生产桌面组合根。API 必须允许 `ai-job-workspace://renderer` 发起带 Bearer token 的跨源请求，不能依赖 Cookie、可信代理断言或 v1 fallback。

## OAuth public client ID 供应链

`AI_JOB_WORKSPACE_OAUTH_CLIENT_ID` 是公开标识，不是 secret。它必须在 `electron-vite build` 或 `electron-vite dev` 启动时存在，并由构建配置验证后静态写入 main bundle。应用启动后再修改同名环境变量不会替换制品身份，这避免不同机器用同一二进制时发生不可审计的 client 漂移。

本地开发可复制示例配置：

```bash
cp apps/desktop/.env.example apps/desktop/.env.local
pnpm dev:desktop
```

也可以由 shell 或 CI 显式提供：

```bash
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop pnpm build:desktop
```

缺失、空白、包含控制字符或超过 255 字符时，构建直接失败。发布流水线必须把示例值替换为 Authorization Server 已登记的生产 public client ID；不得在该变量、`.env*`、ASAR 或 renderer 配置中放 client secret、证书或 token。CI 使用仓库可见的 `workspace-desktop-ci` 生成测试制品，生产发布 workflow 必须显式覆盖它。

Authorization Server 注册必须符合 API STANDARD V2：使用 Authorization Code + PKCE，不配置 client secret；loopback redirect 的 scheme、IP literal（`127.0.0.1` 或 `[::1]`）与 path 精确匹配，只允许系统分配的临时端口变化。桌面端先绑定随机 loopback 端口与高熵 path，再打开系统浏览器；不会使用 WebView、普通 hostname 或固定回调端口。

## Token 与安全存储生命周期

- Access Token 只存在于 main/renderer 内存，应用关闭前会先阻止 `before-quit`，等待授权、刷新轮换与持久化任务静止，再清除内存并退出。
- 受支持的 macOS/Windows 上，Refresh Token 只以 Electron async `safeStorage` 密文写入 `userData/oauth/refresh-grant.v1.bin`。写入采用同目录独占 staging、文件 `fsync`、原子 `rename` 与目录 `fsync`；删除的成功分支在 `finally` 持久同步父目录。
- POSIX 上专用目录固定为 `0700`、记录固定为 `0600`，并校验 owner、类型、路径 containment 与 symlink。Windows 依赖用户 ACL、DPAPI 与原子 rename；Node 不提供可靠目录 `fsync`，因此该平台只执行文件 `fsync`，这是当前精确的持久性边界。
- 受支持平台的启动和新授权在清理旧 grant 前调用 `isAsyncEncryptionAvailable()`。暂时不可用时保留已有密文并向 UI 返回 `secure-storage-unavailable`，不伪装成匿名成功。
- Electron 的 async API 在 Linux 不暴露当前 provider 身份；同步 `getSelectedStorageBackend()` 只描述同步 provider，不能证明 async ciphertext 由 Portal Secret、Secret Service 或其他真实 OS secret provider 保护。因此当前发布在 Linux 上禁用持久 native login：启动或授权前删除受控目录内的旧记录（包括 Chromium `v10` ciphertext），返回 `persistent-login-unsupported`，并引导使用 Web 版或受支持的桌面系统。实现不查询同步 backend，也不把 `isAsyncEncryptionAvailable() === true` 当作安全证明。Electron async API 的能力边界见官方 [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。
- Refresh Token 每次使用都必须轮换。若服务端已签发新 token，但本地因取消、退出、验证失败、ownership 丢失或持久化失败无法提交，新 token 会在独立 15 秒截止内尽力 revoke；不会把已失效的旧 token 留作成功状态。
- 登出点击后 renderer 同步清除 Access Token 并卸载 Workspace，然后 main 清内存会话、执行持久删除和 RFC 7009 revoke。若持久清理或 IPC 确认失败，renderer 进入可重试的阻断锁定页，不会返回认证产品；只有 main 确认匿名会话后才呈现登录入口。

## 构建、打包与 smoke

以下命令都需要构建期 client ID：

```bash
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop-local pnpm build:desktop
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop-local pnpm smoke:desktop:build
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop-local pnpm package
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop-local pnpm smoke:desktop:packaged
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop-local pnpm verify:desktop:package
AI_JOB_WORKSPACE_OAUTH_CLIENT_ID=workspace-desktop-production pnpm dist:desktop
```

`build` smoke 先确认构建期 client ID 已进入 main bundle，再用开发依赖中的 Electron 启动 `out/`。`packaged` smoke 只运行 `release/*-unpacked` 的真实二进制并读取 Fuse wire。两者验证固定 API v2 runtime/CSP、受限 renderer 协议、深链回退、封闭 preload bridge、匿名 hosted identity 入口、默认拒绝权限、新窗口/越界导航阻断和 CSP 越界网络阻断。smoke 会注入一个不同的运行时 OAuth client ID，确保制品不把运行时变量当作身份配置。

CI 在 Linux、macOS 与 Windows 分别构建并启动 unpacked 应用；Linux 使用 Xvfb。该矩阵证明构建供应链、进程边界和 fail-closed 行为，不替代真实 Authorization Server 的 client registration、CORS、Refresh Token reuse detection、签名、公证与安装器验收。

## 发布检查单

1. 确认父仓库固定的 `workspace-shared-docs` revision 已初始化且无本地修改。
2. 在 Authorization Server 登记生产 client ID、固定 loopback IP/path 规则、所需 scopes 与 `offline_access` consent。
3. 由发布 workflow 显式注入生产 `AI_JOB_WORKSPACE_OAUTH_CLIENT_ID`，运行完整 `pnpm check` 与三平台 packaged smoke。
4. 通过真实 TLS 入口验证 discovery、issuer、JWKS、code exchange、nonce、刷新轮换、revoke、CORS 与 Workspace 授权；不得以 Mock 或 v1 回退替代。
5. 使用平台 secret store 注入签名/公证凭据。client ID 可以进入制品，签名证书、密码与 token 不可以。

生产保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 与 `webSecurity: true`。打包继续使用 ASAR 完整性与 Electron Fuses，禁用 `RunAsNode`、`NODE_OPTIONS`、Node CLI inspector，并只允许从 ASAR 加载。安全基线参考 [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution) 与 [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)。
