# AI Job Workspace Frontend

v0.1.0 的跨端前端基础工程：同一套 React 页面同时服务 Vite Web 与 Electron renderer。

## 结构

```text
apps/
  web/             Vite Web 薄入口
  desktop/         Electron main / preload / renderer 薄壳
packages/
  app/             共享领域、mock、i18n、页面与 UI
  platform/        无 Node.js 依赖的平台桥接类型
workspace-shared-docs/
                   前后端共享文档 submodule（只读消费）
docs/              决策和待确认项
```

共享代码遵循单向依赖：领域与 mock adapter 不依赖 React；页面不直接依赖 Electron 或网络传输；`apps/web` 和 `apps/desktop` 只负责组装运行时。

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
```

`pnpm check` 会顺序执行格式检查、lint、类型检查、单测、两端构建与一次真实 Electron 启动 smoke。生产 renderer 使用受限的 `ai-job-workspace://renderer` 自定义协议，preload 仅注入 `getRuntimeInfo()`，不暴露 Node.js 或通用 IPC。

`pnpm package` 在 v0.1.0 生成并验证可运行的 Web `dist/` 与 Electron `out/` 构建产物；签名、自动更新和原生安装包属于后续发布工程，不在本阶段伪造。

## 契约纪律

`workspace-shared-docs/contracts/v1/` 是唯一正式 API 语义来源。v0.1 因尚未接入后端，使用明确命名为 `Mock*Gateway` 的本地适配器；它们不是临时 REST 协议。详情见 [契约待确认项](docs/contract-open-questions.md)。上游变更合并后，可运行 `./update-shared.sh` 审阅新 revision。

Web 使用客户端路由；生产静态宿主需要为产品路径配置入口回退，详见 [Web 单页应用部署](docs/web-deployment.md)。
