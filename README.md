# AI Job Workspace Frontend

v0.1.0 的跨端前端基础工程：同一套 React 页面同时服务 Vite Web 与 Electron renderer。

## 结构

```text
apps/
  web/             Vite Web 薄入口
  desktop/         Electron main / preload / renderer 独立宿主
packages/
  app/             按 bounded context 纵向切分的领域、用例与页面
  platform/        无 Node.js 依赖的平台桥接类型
  product-runtime/ Web 与 Electron 共用的 HTTP 与显式 Demo adapter 装配
workspace-shared-docs/
                   前后端共享文档 submodule（只读消费）
docs/              决策和待确认项
```

共享代码遵循单向依赖：领域与 adapter 不依赖 React；页面不直接依赖 Electron 或网络传输；`apps/web` 和 `apps/desktop` 只负责组装运行时。

## 开发

需要 Node.js `>=22.12.0` 与 pnpm `>=10`。

```bash
git submodule update --init --recursive
pnpm install
pnpm dev:web
pnpm dev:desktop
```

## 质量门禁

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:desktop
pnpm package
pnpm dist:desktop
```

`pnpm check` 会顺序执行格式检查、lint、共享契约与架构门禁、类型检查、Node/DOM/桌面与移动视口的真实 Chromium 测试、两端构建与一次真实 Electron 启动 smoke。生产 renderer 使用受限的 `ai-job-workspace://renderer` 自定义协议，preload 仅注入 `getRuntimeInfo()` 与 typed `saveArtifact()`，不暴露 Node.js、文件路径或通用 IPC。

`pnpm package` 生成带 ASAR 与 Electron Fuses 的当前平台可运行应用目录；`pnpm dist:desktop` 再生成当前平台的原生分发制品。面向最终用户发布前仍必须在目标平台执行代码签名；详见 [Electron 桌面部署](docs/desktop-deployment.md)。

## 契约纪律

`workspace-shared-docs/contracts/v1/` 是唯一正式 API 语义来源。Resume 与 Knowledge 的已确认子集使用 HTTP adapter；Workspace 与 Interview 在路由级请求/响应入口尚未完全冻结处使用明确命名的进程内 Demo adapter，它们不是临时 REST 协议。当前尚未冻结 OIDC/OAuth2 客户端配置与 token 生命周期，因此这些 HTTP adapter 只代表 transport/DTO 已接线，不代表受保护资源已具备生产认证；仓库不会以 Cookie 或前端 secret 冒充契约要求的 Bearer 身份。详情见 [契约待确认项](docs/contract-open-questions.md)。上游变更合并后，可运行 `./update-shared.sh` 审阅新 revision。

Web 使用客户端路由；生产静态宿主需要为产品路径配置入口回退，详见 [Web 单页应用部署](docs/web-deployment.md)。
