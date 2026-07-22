# 前端 v2 后续开发远端交接

**交接日期：** 2026-07-22

**稳定基线分支：** `fix/frontend-quality-baseline-20260722`

**适用对象：** 从远端接手下一阶段前端开发的工程师或 Agent

## 1. 交接目的

当前分支是经过能力审计、Workspace 边界修复和质量门禁修复后的稳定前端基线。下一位开发者必须从该远端分支创建新的功能分支，不应直接在基线分支继续提交业务功能，也不应直接合并到 `main`。

下一阶段唯一首要目标是“v2 Identity / Workspace 第一真实纵向切片”，优先实现 Web 端从真实身份授权到 Workspace-scoped Resume 只读列表的最小闭环。共享 v2 契约处于 Published Standard 状态，但这不表示后端已经实现、提交或部署 v2；缺少后端可执行证据时，前端不得宣称真实 v2 联调完成。

## 2. 仓库与提交基线

- 仓库路径：项目根下的 `workspace-front/`
- `origin`：`https://github.com/TwoJie2/workspace-front`
- 当前分支：`fix/frontend-quality-baseline-20260722`
- 文档创建前 HEAD：`9ddc3ae21941810db5eb7012beb4b4ce1132319e`
- 文档创建前工作区：干净
- 共享契约子模块：`6e49248de3a8141d687697283e0f3e50e864025c`
- Node.js：`v22.20.0`
- Corepack pnpm：`10.33.2`

两个关键提交：

1. `3feb37800e4c82136505c39544b46101e81d0869` — `fix(frontend): enforce workspace boundaries and real API composition`
2. `9ddc3ae21941810db5eb7012beb4b4ce1132319e` — `fix(tooling): restore reproducible frontend quality gates`

不要手工复制或维护第二份完整修改文件列表。下一位开发者应直接查看提交事实：

```bash
git show 3feb378
git show 9ddc3ae
```

能力状态、设计意图与执行边界分别记录在：

- `docs/frontend-capability-audit.md`
- `docs/contract-open-questions.md`
- `docs/superpowers/specs/2026-07-22-frontend-real-api-audit-design.md`
- `docs/superpowers/plans/2026-07-22-frontend-real-api-audit-plan.md`
- `docs/superpowers/plans/2026-07-22-frontend-quality-baseline.md`

计划文档只解释意图；完成事实以提交、实际代码和可执行测试为准。

## 3. 当前已经完成的前端能力

以下能力已在提交 `3feb378` 中实现并由针对性测试覆盖，但它们仍是当前 v1 runtime 上的前端边界，不是 v2 已实现声明：

- Workspace 不再隐式选择列表第一项。
- 服务端 default Workspace 只有在 accessible set 内才可作为初始偏好。
- 没有合法 Workspace 选择时，租户页面不会加载。
- Workspace picker 已连接 application session。
- 非法或因访问权威变化而过期的 Workspace 选择失败关闭。
- Workspace 切换会使 Resume、Knowledge、Interview 路由资源失效并重新读取。
- principal 变化会使租户页面失效，即使新旧 principal 最终选择相同 Workspace ID。
- Resume list/detail/template 读取显式传入 `workspaceId`。
- Resume HTTP detail 会拒绝 `workspace_id` 与请求 Workspace 不一致的响应。
- Web 与 Electron 生产组合显式固定 `apiMajor: 'v1'`。
- 未知 API major 失败关闭，不会自动回退 v1。
- 生产组合根禁止直接或传递导入 InMemory/testing adapter。
- Resume、Knowledge、Interview 现有全局 v1 列表加客户端 `workspace_id` 过滤，不等于服务端租户授权。

重要限制：`refreshAccess()` 的 principal 隔离机制已存在，但生产身份生命周期尚未调用它；Resume mutation/render 也尚未全面显式 Workspace 化。

## 4. 当前质量门禁状态

提交 `9ddc3ae` 将 TypeScript 环境拆分为纯 Node、前端 Node-test 和 renderer 三个配置；前端 Node tests 使用 DOM 与既有 `vite/client` CSS 类型，而 Electron main/preload 不依赖浏览器全局。

最近一次验证结果如下，制作本文档时未重复运行耗时全量测试：

| 命令                               | 最近验证结果                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| `corepack pnpm typecheck`          | 退出 0；三个 TypeScript 配置通过                                      |
| `corepack pnpm test`               | 退出 0；64 个测试文件、748 项测试通过                                 |
| `corepack pnpm test:browser`       | 退出 0；6 个文件、6 项通过                                            |
| `corepack pnpm lint`               | 退出 0                                                                |
| `corepack pnpm build`              | 退出 0；Web、Electron 及构建内产物检查通过                            |
| `corepack pnpm check:architecture` | 退出 0；检查 200 个源文件                                             |
| `corepack pnpm check:contracts`    | 契约逻辑通过；Codex 沙箱普通命令受 Git dubious ownership 限制，见下文 |
| `corepack pnpm check:artifacts`    | 退出 0；检查 20 个生产 JS/HTML 产物                                   |
| `corepack pnpm smoke:desktop`      | 退出 0                                                                |

其他验证事实：

- Workspace/Resume/runtime 针对性 Node 回归：5 个文件、80 项通过。
- Workspace/Resume DOM 回归：4 个文件、40 项通过。
- `.mjs` 修复只通过 `.gitattributes` 将 contracts 和 production-artifacts 两组测试及实现固定为 LF；没有批量转换仓库。
- Playwright `1.61.1` 对应 Chromium/Headless Shell revision `1228` 仅安装在执行者用户缓存，没有提交二进制或修改 lockfile。
- 所有前端门禁均在未启动后端服务的条件下运行。

Codex 沙箱账户与仓库所有者不同，普通 `check:contracts` 会触发 Git `dubious ownership`。仅对当前进程设置父仓库和子模块的 `safe.directory` 后，门禁确认子模块 revision 与四个 v2 发布物并退出 0。不要把该沙箱 workaround 写入仓库或全局 Git 配置；在正常开发账户中先直接运行普通命令。

## 5. `format:check` 已知债务

全仓库 `corepack pnpm format:check` 当前不是绿色。最近一次运行报告约 351 个既有文件，涉及历史 CRLF、`.tmp` 中的独立工作树、依赖备份和大量未修改源码；本轮新增/修改的质量文件已经单独通过 Prettier。

交接前和第一个 v2 产品切片中均禁止全局格式化，也不得一次性重写数百个业务文件。后续治理必须作为独立任务设计并分别确认：

- `.prettierignore` 是否排除 `.tmp/**` 及其他非源码资产；
- `.gitattributes` 的仓库级行尾策略；
- Windows 与 CI 的 checkout、`core.autocrlf` 和 Prettier 策略；
- 逐目录、小范围、可审阅的迁移方案。

该债务不得与 v2 Identity/Workspace 第一切片混在同一个提交或 Pull Request 中。

## 6. 下一阶段的唯一首要目标

下一阶段定义为：

```text
v2 Identity / Workspace 第一真实纵向切片
```

目标流程：

```text
后端能力证据确认
→ Web OAuth/OIDC Authorization Code + PKCE
→ 内存 Access Token
→ Bearer 调用 /api/v2/me
→ 获取 WorkspaceAccess
→ 显式选择 Workspace
→ 身份变化调用 refreshAccess()
→ Workspace-scoped Resume 只读列表
→ loading / empty / error / success
```

第一阶段优先 Web。Electron 的系统浏览器回调、回调 URI、安全存储和 token 生命周期属于后续独立切片，不与 Web 第一切片同时大范围实施。

## 7. 后端前置条件

下一位开发者必须先只读检查后端远端最新已提交分支，不能读取或依赖后端本地未提交工作区。必须找到以下可执行证据：

- v2 路由注册与 handler/controller；
- 请求和响应 Schema；
- OAuth/OIDC discovery；
- authorize、token、JWKS；
- Web public client 配置；
- Bearer Resource Server 校验；
- `/api/v2/me`；
- `/api/v2/workspaces`；
- `WorkspaceAccess`；
- Workspace tenant route；
- 对应自动化测试或可联调部署。

如果证据不存在：

1. 不得伪造登录流程；
2. 不得使用固定 Bearer Token；
3. 不得创建硬编码用户或假 Workspace；
4. 不得将 v1 password session 冒充 v2 OAuth；
5. 不得将客户端过滤描述为服务端授权；
6. 应输出逐项后端阻塞清单；
7. 只能完成明确标为非生产的契约消费者、adapter 与测试基础，不能宣称真实切片验收完成。

## 8. 下一位开发者的实施流程

### 步骤 A：检出基线

```bash
git fetch origin
git switch -c feat/v2-identity-workspace-slice \
  origin/fix/frontend-quality-baseline-20260722
```

不得直接在基线分支提交新功能。

### 步骤 B：重新验证基线

至少运行：

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm check:architecture
```

若环境不同，必须区分代码失败、依赖/浏览器缺失、Git 所有权限制、网络失败和操作系统差异。

### 步骤 C：检查后端证据

只读检查后端最新已提交远端分支及可联调部署，不得依赖后端未提交工作区，也不得用本地实验端点覆盖正式契约事实。

### 步骤 D：形成小范围实施计划

第一轮只做 Identity/Workspace tracer bullet，不同时重写 Resume 写入、Knowledge、Interview、Agent、Electron OAuth、SSE 或 Artifact。

### 步骤 E：测试驱动实现

至少覆盖：

- PKCE state/nonce 校验；
- Access Token 不写入 localStorage；
- Bearer `Authorization` Header；
- `/api/v2/me` validator；
- `WorkspaceAccess` validator；
- 401 重新授权；
- 403 与 404 正确区分；
- Workspace 显式选择；
- principal 变化与 `refreshAccess()`；
- Workspace-scoped Resume list；
- 禁止 v2 失败回退 v1；
- 禁止 API 失败回退 InMemory；
- 禁止接受跨 Workspace 数据。

## 9. 第一切片验收标准

只有后端前置条件真实存在时，才可按以下标准验收：

1. Web 从真实 authorization endpoint 发起 PKCE；
2. callback 完成 state、nonce、issuer 校验；
3. Access Token 只保存在内存；
4. 使用 Bearer 请求真实 `/api/v2/me`；
5. 真实读取 `WorkspaceAccess`；
6. 无合法 Workspace 时不加载租户页面；
7. Workspace 变化使租户数据失效；
8. principal 变化调用 `refreshAccess()`；
9. Resume list 使用服务端 Workspace tenant route；
10. 不再用全局列表加客户端过滤模拟授权；
11. 401、403、404、422、429 和 contract error 有可见且明确的区分；
12. v2 不会静默回退 v1；
13. 生产不导入 testing/InMemory adapter；
14. typecheck、test、lint、build 和 architecture 均通过。

如果后端未满足前置条件，不得宣称以上验收完成。

## 10. 后续路线图

第一切片之后按以下顺序推进：

```text
Resume 完整闭环
→ Knowledge 完整闭环
→ Interview 完整闭环
→ Conversation / Agent / Tool Approval
→ 通用 Job / Artifact / SSE
→ Electron OAuth 与 secure storage
→ format/Windows 基线独立治理
→ 发布验收
```

Resume 完整闭环：

```text
列表 → 创建/导入 → 详情 → 编辑操作 → 模板 → 保存 → Render Job → Artifact/PDF
```

Knowledge 完整闭环：

```text
列表 → 创建数据源 → 授权或上传 → ingestion/sync Job → 搜索 → 可见性 → 删除
```

Interview 完整闭环：

```text
场景 → 创建会话 → realtime connection → 回答与转写 → 结束 → report Job → 评分与结果展示
```

不得用固定评分、固定报告、定时器或静态数据伪造完成。

## 11. 明确禁止项

下一阶段禁止：

- 全局替换 `/api/v1` 为 `/api/v2`；
- 同一个 parser 宽松兼容 v1/v2；
- v2 失败后回退 v1；
- API 失败后回退 InMemory；
- 浏览器伪造受信身份头；
- 使用固定 Token；
- 在 localStorage 保存正式 Token；
- 在前端保存 client secret；
- 依赖后端未提交代码；
- 客户端过滤冒充服务端授权；
- 同时重构所有 bounded context；
- 全局格式化；
- 修改共享契约子模块；
- 删除或永久跳过测试；
- 降低严格 validator；
- 使用 `any` 或 `@ts-ignore` 掩盖错误。

## 12. 风险与阻塞

- 后端 v2 Identity/Workspace 可能尚未提交或部署。
- OAuth issuer、client ID、scope、redirect URI、CORS 和注销策略可能尚未明确。
- `/api/v2/me`、`/api/v2/workspaces` 或 Workspace tenant route 可能缺失。
- Electron 身份回调与系统安全存储尚未实现。
- 全仓库 format/Windows 行尾存在历史债务。
- 当前生产组合仍固定 v1，v2 adapter 尚不存在。
- principal 刷新机制已有，但生产身份触发链未接通。
- Resume mutation/render 尚未全面 Workspace 化。
- Published Standard、测试 fixture 或客户端校验都不能替代后端部署和服务端授权证据。

## 13. 远端协作说明

- 稳定基线远端分支：`origin/fix/frontend-quality-baseline-20260722`
- 推荐下一功能分支：`feat/v2-identity-workspace-slice`
- 不应直接向基线分支提交后续功能。
- 不应直接合并到 `main`。
- 每个 bounded context 使用独立、小范围、可审阅提交。
- Pull Request 必须附质量门禁结果、后端已提交契约证据、失败关闭测试和未完成边界。
- 本交接只发布基线与文档，不创建 Pull Request。

## 14. Suggested skills

- `review`：在新功能分支创建前，按 `3feb378` 与 `9ddc3ae` 做规范和任务符合性复核。
- `writing-plans`：后端前置证据明确后，为 Web Identity/Workspace tracer bullet 编写小步实施计划。
- `test-driven-development`：以 PKCE、token 生命周期、validator、错误分类和禁止 fallback 的失败测试驱动实现。
- `diagnose`：如新环境门禁失败，先区分代码、浏览器、Git 所有权、网络和 Windows 行尾问题。

未经用户授权，不要直接进入实现；先确认后端已提交证据与第一切片范围。
