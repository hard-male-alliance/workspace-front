# Resume 写入、Proposal 审批与 PDF 渲染接入设计

## 目标

在不改变现有 React 页面、领域 Gateway、Mock adapter 与平台边界的前提下，让 Web 端完成以下能力：

1. 首页导航到真实后端返回的 Resume，而不是固定 Mock ID。
2. 通过正式 `ResumeOperationBatch` 保存板块编辑、排序、板块删除和模板切换。
3. 通过 Resume Proposal 完成“生成建议—明确接受或拒绝”的审批流程。
4. 通过 Render Job 生成、恢复和展示 PDF artifact。

Electron 继续使用 Mock Gateway。本设计不接入浏览器身份断言头、模型服务、Render SSE、整份 Resume 删除或尚未冻结的正式 Resume 创建 DTO。

## 既有事实与范围边界

- Web 已使用 `HttpResumeGateway` 读取模板、Resume 列表和 Resume 详情，并缓存详情响应的 `ETag`。
- 后端已有正式 `POST /api/v1/resumes/{resume_id}/operations`，请求为 `ResumeOperationBatch`。
- 后端 `POST /api/v1/resumes` 使用 `MockResumeCreateRequest`，路径明确标记为 Mock。前端可以把它作为开发阶段临时创建能力，但不能宣称正式契约已冻结。
- 后端没有删除整份 Resume 的产品路由。现有 UI 的删除动作是 `RemoveSectionOperation`，不是删除 Resume。
- Proposal 的读取、列表和 decision 使用正式结构；Proposal create 请求仍是 Mock adapter。
- Render Job、Job 查询、artifact 列表、PDF content 与 source map 已实现；Render SSE 和取消尚未实现。

## 方案选择

采用“领域端口稳定、HTTP adapter 集中映射、页面显式呈现审批和任务状态”的方案。

不采用以下方案：

- 保留 Mock 助手自动写回：这会把 Proposal 审批语义隐藏在页面之外。
- 页面直接调用 `fetch`：这会绕过 Gateway、运行时校验和统一错误处理。
- 猜测 Resume DELETE、Render SSE 或正式 Proposal create DTO：后端当前没有相应冻结证据。

## 领域模型与 Gateway

### 首页导航

`WorkspaceHomePage` 同时通过 `WorkspaceGateway` 读取首页投影，并通过 `ResumeGateway.listResumeCards()` 读取真实 Resume。页面选择 `updatedAt` 最新的 Resume 作为继续编辑目标。没有 Resume 时显示空状态和模板入口，不生成虚假 ID。

### Resume 操作

保留现有业务方法：

- `updateResumeSection`
- `reorderResumeSections`
- `deleteResumeSection`
- `selectResumeTemplate`

`HttpResumeGateway` 将这些方法集中转换为 `ResumeOperationBatch`。每个批次使用新的不透明 `client_batch_id` 和 `operation_id`，`base_revision` 来自最近读取的 Resume，默认 `conflict_strategy=reject`，编辑操作使用 `render_hint=preview`。

适配器为每份 Resume 缓存最新文档和 ETag。写请求发送 `If-Match` 与幂等键；成功后校验 `ResumeOperationBatchResult` 和其中的 `normalized_document`，再映射为新的编辑器投影。若响应未包含规范化文档，则重新读取 Resume。409/412 保留为结构化 `HttpProblemError`，由页面显示版本冲突并提供重新加载入口，不自动覆盖新版本。

开发阶段的 Resume 创建单独标记为 Mock capability；不把 `MockResumeCreateRequest` 命名或导出为正式 DTO。整份 Resume 删除不进入 Gateway，因为后端没有路径。

### Proposal 审批

新增领域 Proposal 展示模型，包含 ID、标题、摘要、状态、基础 revision 和可展示的变更摘要。Gateway 提供：

- 列出当前 Resume 的 pending Proposal；
- 使用自然语言创建临时 Proposal；
- 接受全部 Proposal；
- 拒绝 Proposal。

Proposal create 只在 HTTP adapter 内使用后端当前 Mock 请求，并明确记录待替换条件。接受与拒绝调用正式 decision 路由，使用幂等键。页面不再把发送消息解释为已经修改 Resume；它展示待审批卡片，只有接受成功后才重新读取权威 Resume。拒绝不会更改 Resume。

现有 `sendAssistantMessage`/`undoAssistantChange` 的 Mock 行为保留给 Electron。Web 端页面改为调用显式 Proposal 方法后，不提供没有后端契约支持的 undo。

### PDF Render Job

新增领域 render 状态模型和 Gateway 方法：

- 创建 PDF preview Render Job；
- 查询指定 Job；
- 列出 Resume 的 PDF artifact；
- 将 artifact 的下载地址映射为当前后端产品 API 下的安全 URL。

页面把“开始任务”“轮询进度”“读取最终 artifact”分开处理。轮询采用有界间隔与总超时，路由切换、重新渲染或组件卸载时使用 `AbortController` 清理。成功 Job 的 artifact 或恢复出的最新 artifact 成为 PDF 预览权威来源。失败、取消、过期、超时和缺少 PDF artifact 分别进入可重试错误状态。

PDF content 可以在现有预览窗口中用浏览器原生 PDF 展示，并提供下载链接。语义纸张预览作为尚未生成 PDF 时的回退，不再标记为正式 PDF。

## HTTP 边界

扩展统一 HTTP client，使其支持 JSON POST 和必要请求头，但不允许页面传入完整 URL或身份断言头。adapter 负责：

- `/api/v1` 前缀；
- JSON content type；
- `Idempotency-Key` 与 `If-Match`；
- `application/problem+json`；
- `AbortSignal`；
- 响应状态、content type 和运行时结构校验。

页面不发送 `X-Mock-*` 或 `X-AIWS-*`，也不记录自由文本、Proposal 内容、PDF URL 或敏感响应。

## 页面状态与交互

- 首页：loading、ready、无 Resume、错误。
- Resume 保存：提交中禁用同一动作；成功更新 revision；冲突显示重新加载；其他错误可重试。
- Proposal：创建中、pending、接受中、拒绝中、冲突/过期、失败；重复点击受保护。
- PDF：未生成、排队、渲染中、成功、失败、超时；重复开始受保护，卸载清理轮询。

错误文案去除“已保存到 Mock”“正式 PDF”等误导描述。界面继续复用现有按钮、错误状态、状态标签、三栏布局和设计令牌，不引入新的 UI 系统。

## 测试策略

严格按 TDD 分批完成：

1. 首页真实 Resume 导航与无 Resume 状态。
2. HTTP client JSON command、请求头、取消与 Problem Details。
3. 每类 Resume operation 的 DTO 映射、ETag/幂等键和冲突传播。
4. Proposal 校验、创建、恢复、接受、拒绝及页面重复提交保护。
5. Render Job/artifact 校验、轮询完成、失败、超时和卸载取消。
6. Web 混合 Gateway、页面可访问状态、类型、lint、全量测试及 Web/Electron 构建回归。

## 待后端冻结事项

- 正式 Resume 创建 DTO 与产品文案。
- 整份 Resume 的删除/归档语义、路径和响应。
- 正式 Proposal create 请求、Agent Run、SSE、取消和恢复语义。
- Render Job SSE、取消接口、轮询建议、artifact URL 部署形态和缓存期限。
- Workspace 首页聚合 API；当前首页仍由 Mock Workspace 投影与真实 Resume 列表组合。

以上事项继续保留在 `domain/pending.ts`，只有后端实现、契约和联调证据齐全后才关闭。
