# 前端 HTTP 只读联调第一阶段设计

> **状态：已归档（Archived）。** 本文只记录历史阶段设计，不是现行产品能力说明。[ADR 0002](../../adr/0002-protect-production-api-truth.md)、固定的共享契约与当前部署文档已取代其中的 Mock 产品组合和能力假设。

日期：2026-07-19

## 目标

在不改变现有页面业务交互的前提下，为 Web 端接入后端已经提供的模板、简历和知识来源只读能力。第一阶段建立可复用的 HTTP、运行时校验和映射边界，为后续 Resume 写入、Proposal 和 PDF 联调提供稳定基础。

## 范围

本阶段包含：

- 统一 HTTP client；
- 第一阶段 transport DTO 与运行时校验；
- API `snake_case` 到现有 UI `camelCase` 模型的集中映射；
- `HttpResumeGateway` 的模板、简历列表和简历编辑器只读能力；
- `HttpKnowledgeGateway` 的知识来源列表能力；
- Web 端混合 Gateway 装配；
- HTTP、校验、映射、Gateway 和 Web 装配测试。

本阶段不包含：

- Resume 创建、OperationBatch 写入、ETag 冲突恢复；
- Proposal 创建、恢复和 accept/reject；
- PDF Render Job、轮询和 Artifact 内容；
- Knowledge 写入、上传、删除、同步和可见性修改；
- Workspace、登录、Interview、SSE、WebSocket、WebRTC；
- Electron 的真实 HTTP 装配。

## 架构

```text
apps/web
  -> 读取并校验 VITE_API_BASE_URL
  -> 注入混合 AppGateways
      workspace: MockWorkspaceGateway
      resume: HttpResumeGateway
      interview: MockInterviewGateway
      knowledge: HttpKnowledgeGateway

React 页面
  -> 现有 ResumeGateway / KnowledgeGateway
  -> HTTP Gateway
  -> mapper
  -> 统一 HTTP client
  -> 当前项目后端 /api/v1
```

页面继续只依赖领域 Gateway 和 `Ui*` 模型，不读取 transport DTO，不直接使用 `fetch`。共享 `packages/app` 不读取 Vite 环境变量；`apps/web` 是 Web 运行时装配边界。Workspace、Interview、Electron 和测试默认继续使用现有 Mock Gateway。

## 模块设计

在 `packages/app/src/infrastructure/http/` 中建立以下边界：

- `http-client.ts`：负责 base URL 拼接、JSON 请求、响应状态和 content type 检查、AbortSignal、ProblemDetails、请求 ID 与 `Retry-After`；
- `transport-types.ts`：仅定义第一阶段实际使用的后端 DTO，不复用 UI 模型；
- `validators.ts`：以 `unknown` 接收外部数据，校验后返回 transport DTO；
- `mappers/`：只负责 transport DTO 到现有 UI/领域投影的转换；
- `http-resume-gateway.ts`：实现模板、简历列表和编辑器只读投影；
- `http-knowledge-gateway.ts`：实现知识来源列表投影；
- `index.ts`：公开 Web 装配需要的最小 API。

在 `apps/web/src/` 中新增 Web Gateway factory。它读取调用方传入的公开 base URL，并组装混合 `AppGateways`。环境变量读取保留在 `apps/web`，不下沉到共享包。

## 数据行为

列表响应必须符合：

```json
{
  "items": [],
  "page": {
    "next_cursor": null,
    "has_more": false
  }
}
```

第一阶段保持现有 Gateway 的数组返回签名，因此 adapter 逐页请求并原样回传不透明 cursor，直到 `has_more=false`。adapter 不解析、修改或持久缓存 cursor。为防止错误服务端形成无限循环，重复 cursor 或 `has_more=true` 但缺少 `next_cursor` 应被视为契约错误。

所有 JSON 以 `unknown` 接收，并在 HTTP adapter 边界进行运行时校验。校验失败抛出不包含响应正文的契约错误。

映射规则：

- 后端 `snake_case` 集中转换为 UI `camelCase`；
- `ResumeDocument.template_id/template_version` 映射为 UI template 投影；
- `knowledge_source_id` 映射为 `knowledgeSourceId`；
- 简历卡片的模板名称由模板目录按 ID 和版本解析，无法解析时显示模板 ID；
- 模板 `previewAssetUrl` 固定为 `null`，不伪造缩略图；
- 后端没有正式 conversation/message 查询接口，因此真实简历的 `assistantMessages` 返回空数组；
- Knowledge 缺少的展示字段只在 mapper 使用经过测试的安全默认值；
- Knowledge 可见性设置页继续使用 Mock，不宣称设置已由后端持久化。

Resume 详情响应的 ETag 由 HTTP Gateway 保存到内部只读记录中，为第二阶段写入设计提供接入点。本阶段不发送 `If-Match`，也不实现写操作。

## HTTP 与错误边界

HTTP client 必须：

- 只连接配置的公开 base URL 与统一 `/api/v1` 产品前缀；
- 支持 AbortSignal；
- 先检查状态码和 content type，再解析 body；
- 对非 2xx `application/problem+json` 返回结构化错误；
- 对非 ProblemDetails 或非 JSON 错误返回不泄露响应正文的通用错误；
- 保留可安全展示或处理的 status、problem code、request ID 和 `Retry-After`；
- 不记录响应正文、用户自由文本、URL 查询内容、身份断言或秘密；
- 不发送 `X-Mock-*`、`X-AIWS-*` 或任何数据库、模型、HMAC 凭证。

`VITE_API_BASE_URL` 未设置、不是有效的 HTTP(S) URL，或包含非根路径时，Web 显示明确的启动配置错误并停止装配，不自动回退 Mock。

## 生命周期

HTTP client 接受 AbortSignal。现有 Gateway 端口第一阶段仍保持当前签名，因此页面级取消接线不在本阶段扩展；client 先具备取消能力，后续在写入和轮询阶段扩展领域输入并接入组件卸载取消。现有页面的 effect 存活保护继续阻止卸载后的状态写入。

## 测试策略

实现采用测试先行：每项生产行为先添加会因功能缺失而失败的测试，再添加最小实现。

- HTTP client：URL 拼接、成功 JSON、ProblemDetails、非 JSON 错误、请求取消；
- validators：合法 fixture、缺失字段、错误字段类型、分页结构和错误 cursor；
- mappers：模板、Resume、Knowledge 字段转换与安全默认值；
- Resume Gateway：分页、模板名称解析、编辑器组合、ETag 记录；
- Knowledge Gateway：分页与列表映射；
- Web 装配：四个 Gateway 的混合选择、缺失或无效 base URL 的 fail-fast；
- 回归：现有 Mock Gateway、页面、路由和 Electron 装配测试继续通过。

完成后执行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 验收标准

- Web 配置有效 base URL 后，模板、简历和知识来源读取走真实 HTTP Gateway；
- Workspace 和 Interview 仍使用现有 Mock；
- Electron 与测试缺省行为不变；
- 页面和组件中没有 `fetch`、后端 DTO 或硬编码完整后端地址；
- 外部 JSON 都经过运行时校验和集中映射；
- 分页 cursor 只被原样回传；
- 非 2xx、ProblemDetails、无效 JSON 和契约不匹配均成为可识别错误；
- 浏览器请求不包含身份伪造头或秘密；
- 缺失或无效 `VITE_API_BASE_URL` 时显示清晰启动错误；
- 全部前端门禁通过，无无关格式化或重构。

## 后续阶段

第二阶段在同一边界上增加 Resume 创建和 OperationBatch，并完整处理 Idempotency-Key、ETag、If-Match、409、412 和用户恢复。第三阶段增加 Proposal 领域端口与待确认交互。第四阶段增加 PDF Job 轮询、Artifact 恢复和 Knowledge 联动读取。页面继续通过稳定 Gateway 使用这些能力，transport 细节只在 adapter 中扩展。
