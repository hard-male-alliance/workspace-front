# PR #2 合并与前端后端契约对齐设计

> **状态：已归档（Archived）。** 本文只记录历史阶段设计，不是现行产品能力说明。[ADR 0002](../../adr/0002-protect-production-api-truth.md)、固定的共享契约与当前部署文档已取代其中的 Mock 产品组合和能力假设。

## 目标

在不修改 `workspace-back/` 的前提下，以当前 `feat/frontend-ui-refresh` 分支为基线完成两项工作：

1. 吸收 `hard-male-alliance/workspace-front#2` 中新增的服务器地址集中配置、Web/Electron 运行时装配和部署说明。
2. 完成 Knowledge HTTP 能力、Resume 冲突恢复以及相关页面状态，使前端达到“契约已对齐、具备共享后端联调条件”的状态。

后端代码、数据库和服务进程不属于本次修改范围。`workspace-back/` 仅作为 method、path、DTO、状态码、错误结构和身份边界的只读权威来源。没有共享环境 smoke 证据时，不宣称端到端联调完成。

## 已确认的基线

- 前端当前分支为 `feat/frontend-ui-refresh`，工作区无未提交文件，相对 `origin/feat/frontend-ui-refresh` 领先 3 个本地提交。
- 后端当前为干净的 `main`，本任务不修改它。
- PR #2 与当前分支的共同祖先为 `aa32088`。
- PR #2 前四个提交形成的代码树与当前分支已包含的界面改版基线相同，但提交哈希不同。
- PR #2 真正尚未吸收的增量集中在 `2bc80d6 refactor(web): centralize backend API configuration`。
- 当前分支的 HTTP 层已经包含更完整的运行时校验、Problem Details、ETag、Proposal 和 Render 支持。PR #2 新增的 `ApiClient` 不能直接替换这些能力。

## 方案选择

采用“选择性吸收 PR 增量，并在现有 HTTP 边界上整合”的方案。

不直接合并 PR 的完整重复历史。完整 merge 会在领域模型、Gateway、Resume 页面和 HTTP 基础设施中制造大量非业务冲突，并可能回退当前分支已经实现的契约校验。也不并行保留 PR 的 `ApiClient` 与当前 `HttpClient`，避免形成两套请求、错误和 DTO 解析路径。

实施时以 `2bc80d6` 为内容来源，保留当前 HTTP 基础设施，将其中有价值的配置和装配设计移植到现有边界。最终 Git 历史应清楚记录 PR 来源，但代码以当前契约能力的超集为准。

## API 地址配置与运行时装配

Web 的公开服务器地址只在 `apps/web` 读取和校验，共享 `packages/app` 不读取 Vite 环境变量。页面也不接触完整 URL。

配置层保留单一规范化入口，接受公开的 HTTP(S) origin，拒绝以下输入：

- 缺失或空值；
- 非 HTTP(S) 协议；
- 含用户名或密码；
- 含业务路径、query 或 fragment；
- 非法端口。

PR #2 的协议、主机和端口拆分设计作为新的部署输入，但必须在同一配置模块中归一化为一个 origin，再交给现有 `createHttpClient`。现有 `VITE_API_BASE_URL` 作为兼容入口继续支持：只配置它时直接校验并使用；未配置它时使用 PR 的 `VITE_API_PROTOCOL`、`VITE_API_HOSTNAME`、`VITE_API_PORT`，三项均未配置时采用 PR 已确认的 `https://api.hmalliances.org` 部署默认值。完整 URL 与任意拆分项同时出现时视为配置冲突并显示启动错误，不能静默选择其中一组。示例配置只能包含公开地址，不能包含 DSN、模型密钥或身份凭证。

Web 运行时继续注入混合 Gateway：

```text
workspace -> MockWorkspaceGateway
resume    -> HttpResumeGateway
interview -> MockInterviewGateway
knowledge -> HttpKnowledgeGateway
```

Electron renderer 继续使用现有窄平台边界和 Mock Gateway，除非 PR 的变更只是安全地共享地址配置类型；不得因此让 Electron renderer 直接获得 Node.js、通用 IPC 或敏感配置。

配置错误应在 Web 启动界面显示明确、非敏感的错误，而不是静默回退或抛出未捕获异常。

## Knowledge 领域端口

在现有 `KnowledgeGateway` 上做最小扩展，方法表达业务意图，不暴露 path、header 或通用 `request()`：

- 上传新的知识来源；
- 为已有来源上传新版本；
- 查询摄取任务状态；
- 执行知识搜索。

输入包含文件、必要的领域标识和可选 `AbortSignal`。输出使用适合 UI 消费的领域模型，至少表达来源、摄取任务、任务终态、搜索结果和可展示错误上下文。HTTP DTO 独立定义，不能复用 `Ui*` 类型作为 transport 类型。

尚未冻结的上传契约状态、生产身份入口、分页和长期恢复语义继续记录在 `domain/pending.ts`。只有后端实现、契约与前端联调证据齐备后才能关闭条目。

## Knowledge HTTP adapter

HTTP adapter 按后端实际实现绑定：

- `POST /api/v1/knowledge-sources/uploads`；
- `POST /api/v1/knowledge-sources/{source_id}/versions`；
- `GET /api/v1/knowledge-ingestion-jobs/{job_id}`；
- `POST /api/v1/knowledge-searches`。

上传使用 `FormData`，不得手工设置 multipart `Content-Type` 或 boundary。每次新的用户上传动作生成新的 `Idempotency-Key`；同一次安全重试复用原 key，不同动作不能复用。

所有外部响应先作为 `unknown` 接收，在 adapter 边界验证 content type、状态码和 DTO 结构，再集中映射为领域模型。JSON 请求继续沿用现有默认行为，新增 FormData 支持不能破坏 Resume、Proposal 和 Render 请求。

所有长请求和轮询传递 `AbortSignal`。摄取轮询使用固定上限和合理间隔，遇到成功、失败、取消、超时、请求错误或达到上限时终止，不能无限循环。页面卸载和路由切换必须取消尚未完成的请求。

## 页面状态与交互

Knowledge 页面继续复用现有组件、设计令牌、i18n 和样式体系，不引入新的 UI 框架或平行状态库。

上传流程包含：

```text
idle -> validating -> uploading -> ingesting -> succeeded
                                  -> failed
                                  -> cancelled
```

客户端在请求前校验 `.txt`、`.md`、`.markdown`、`.pdf`、`.docx` 和 10 MiB 上限；服务端仍是最终权威。提交期间禁用相同动作，防止重复上传。上传成功只表示已接受摄取任务，不能立即显示为“已完成同步”。

页面同时支持已有来源上传新版本，以及搜索的 idle、loading、empty、success、error 状态。搜索结果只能来自 Gateway，不能把 Mock 数据或 DTO 直接写入 JSX。

必须移除硬编码 `ks_mock_git`。修改可见性时使用页面实际加载的 source id；如果对应后端写入契约尚未冻结，则保持明确的 Mock/只读状态，不能伪装成已持久化。

删除“保存到 Mock 状态”“正式同步完成”等与实际能力不一致的文案。Workspace 和 Interview 仍可保留 Mock，但需在用户可见位置准确标识。

## Resume 冲突恢复

Resume 写操作继续携带服务端读取所得的 `ETag`/`If-Match` 和每次用户动作对应的幂等键。

当后端返回 409 或 412 时：

1. 不进行 optimistic revision 增量或静默覆盖；
2. 保留结构化 `HttpProblemError`；
3. 页面显示可理解的冲突说明；
4. 提供重新获取服务端权威 Resume 的恢复入口；
5. 重新加载前停止继续提交基于旧 revision 的操作。

本轮不自动重放用户编辑，也不猜测合并策略。自动重放需要单独冻结并发和冲突解决契约。

## 错误处理与安全边界

统一错误处理至少区分：

- 409：幂等、状态或证据冲突；
- 412：Resume ETag 过期；
- 413：文件超过限制；
- 422：扩展名、MIME、内容或 Schema 校验失败；
- 网络失败、非 JSON 响应、畸形 JSON、缺失字段和未知枚举；
- 摄取失败、轮询超时和用户取消。

用户界面显示可恢复的业务说明；开发日志不记录文件内容、自由文本、token、完整敏感 URL 或响应正文。

浏览器和 Electron renderer 不发送 `X-Mock-*`、`X-AIWS-*` 或其它可信代理身份断言，不调用 Dashboard API 或 `/_internal/healthz` 作为产品数据接口，也不直接调用模型服务。

## 测试策略

后续实现严格采用测试先行，并按垂直切片推进：

1. PR 配置兼容和 Web 装配：环境变量、规范化、非法地址、配置错误页面和混合 Gateway。
2. HTTP client FormData：不手工设置 boundary、幂等键、AbortSignal、非 JSON和 Problem Details。
3. Knowledge DTO 和 mapper：202 响应、运行时校验、未知或缺失字段。
4. 上传和新版本 Gateway：method、path、body、header 和 transport 到 domain 映射。
5. 摄取轮询：成功、失败、取消、超时、达到上限和卸载清理。
6. 搜索：请求映射、成功、空结果、错误和取消。
7. 页面交互：文件校验、重复提交保护、真实 source id、错误文案和清理。
8. Resume 冲突：409/412 展示、阻止旧 revision 继续提交和重新加载权威数据。

完成后执行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

中文 Windows 路径下按现有交接说明使用 Vite/Vitest `--configLoader runner` 兼容命令。全量测试中已有的三个 Electron Windows 自定义协议路径断言失败必须与新增回归分开报告，不得误报为通过，也不得未经授权扩大范围修复。

## 完成标准

- PR #2 的新增配置意图已吸收，且没有引入第二套 HTTP client 或降低现有运行时校验。
- 页面无直接 `fetch`、无硬编码完整后端地址、无硬编码 Mock source id。
- Knowledge 上传、新版本、任务查询和搜索均经过 `KnowledgeGateway` 与 HTTP adapter。
- FormData、幂等、取消、有限轮询和 Problem Details 均有测试。
- Resume 409/412 不覆盖服务端权威 revision，并提供明确恢复路径。
- Workspace/Interview/尚未冻结的 Knowledge 能力仍准确标记为 Mock 或待联调。
- 前后端契约副本保持一致，工作区没有无关修改。
- 未完成共享环境 smoke 前，交付结论仅为“前端契约已对齐、具备联调条件”。

## 不在本次范围内

- 修改 `workspace-back/` 的代码、配置、数据库或契约；
- 启动本地 PostgreSQL、Docker 或后端服务；
- Workspace、登录、成员和 Interview 的真实 API；
- WebSocket、WebRTC 或新的 SSE 协议；
- 浏览器直接调用模型服务；
- Knowledge 删除、同步、可见性写入等尚未冻结的产品接口；
- 为合并 PR 而重做界面、全局样式或无关代码结构。
