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
  product-runtime/ Web 与 Electron 共用的正式 HTTP adapter 装配
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

测试采用混合放置：单模块纯逻辑、adapter 与页面测试跟随源码；跨上下文应用集成测试放在 `packages/app/tests/integration/`；依赖真实 Chromium 的用户旅程放在 `packages/app/tests/browser/`；只有跨包或仓库级测试才进入根 `tests/`。`.node.test.*`、`.dom.test.*`、`.browser.test.*` 后缀决定运行环境，架构门禁阻止 Electron main/preload 与完整 App 测试放错位置。

`pnpm package` 生成带 ASAR 与 Electron Fuses 的当前平台可运行应用目录；`pnpm dist:desktop` 再生成当前平台的原生分发制品。面向最终用户发布前仍必须在目标平台执行代码签名；详见 [Electron 桌面部署](docs/desktop-deployment.md)。

## 契约纪律

`workspace-shared-docs/contracts/v2/` 的四个发布物是当前正式 API 标准。Published Standard 不表示后端已经部署 v2：Web/Electron 生产组合目前显式选择现有 v1 HTTP runtime，且不会在失败后自动回退到另一个 major 或进程内演示数据。当前已提交后端尚未提供前端启动所需的身份与 Workspace 权威，因此 HTTP adapter 已接线也不等于受保护资源可用于生产。正式 Gateway、Web 下载与 Electron 原生保存不会伪造可信代理身份、Cookie 或 Bearer token。详情见 [前端能力审计](docs/frontend-capability-audit.md) 与 [契约待确认项](docs/contract-open-questions.md)。上游变更合并后，可运行 `./update-shared.sh` 审阅新 revision。

生产数据来源、协议校验、错误重试与跨源产物的约束记录在 [ADR 0002：保护生产 API 真相与失败语义](docs/adr/0002-protect-production-api-truth.md)。架构门禁会检查生产组合的传递依赖图，拒绝它经由 facade 或 barrel 抵达 testing/memory adapter；同时用已知高风险文案规则拦截生产 UI 重新出现 demo、Mock、演示或占位数据提示。“Mock interview / 模拟面试”仍是合法产品术语，文案规则只是回归护栏，不替代代码审阅。

Web 使用客户端路由；生产静态宿主需要为产品路径配置入口回退，详见 [Web 单页应用部署](docs/web-deployment.md)。
