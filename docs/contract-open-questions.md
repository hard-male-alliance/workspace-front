# v0.1.0 契约待确认项

本文件不定义、替代或修改 `workspace-shared-docs/contracts/v1/` 中的正式前后端契约。Web 与 Electron 对逐项核对过的能力共享 `Http*Gateway` 装配；未冻结条目不创建临时 REST 路由、不产生本地假成功，也不回退到进程内演示数据。共享 HTTP 装配只说明 transport 与 DTO 边界一致，不等于身份链路已经完成。

## 已确认的边界

- `workspace-shared-docs/contracts/v1/ai-job-workspace.contract.schema.json` 是唯一的机器可读正式契约；其版本为 `1.0.0`。
- 简历的权威数据是语义中间表示（Semantic Intermediate Representation, SIR）；前端不得提交 HTML、CSS、LaTeX 或模板渲染器内部指令。
- 模板页面只表达 `TemplateManifest` 与 `ResumeStyleIntent` 中的语义意图。
- 面试以 REST 资源、实时 JSON 控制面和 WebRTC 媒体面分层；v0.1 不模拟或伪造它们的网络协议。
- 知识访问默认拒绝，必须以 `KnowledgeVisibilityPolicy` 和会话选择共同决定。
- 知识来源列表、详情、刷新与可见性修改只使用已确认的正式资源；上传和搜索在请求/响应 entrypoint 冻结前保持不可操作。
- Resume 写入遇到 409/412 时，前端锁定后续写入并显式重读权威资源，不自动重放本地修改。
- 当前固定模板的样式保存只使用 `set_style_intent`；模板目录不代表客户端可以绕过迁移流程发送 `set_template`。

## 待服务端冻结

| 范围         | 待确认项                                                                                                            | v0.1 前端处理                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP DTO     | Markdown 路由与 JSON Schema 尚未由统一 OpenAPI entrypoint 关联，部分能力缺少完整 request/response envelope。        | 只接入由路由、模型和 Schema 共同确认的子集；adapter 严格校验响应，未确认能力不进入应用端口。                                                                                                                                                                                                                                             |
| 知识文件上传 | `UploadSession` 的创建、分片/直传、完成确认、取消和摄取 Job 关联方式尚未冻结。                                      | 添加来源与上传新版本入口保持禁用，不猜测 multipart 路径或 202 包装。                                                                                                                                                                                                                                                                     |
| 知识搜索     | 搜索请求虽有资源模型，但响应 envelope、分页和授权审计尚未冻结为完整路径契约。                                       | 搜索入口明确提示暂不可用，不在客户端生成结果或调用猜测路由。                                                                                                                                                                                                                                                                             |
| 模板本地化   | `TemplateManifest.label_key` / `description_key` 的翻译提供方、版本与回退规则未定义。                               | 已知产品 key 使用本地翻译；未知后端 key 原样显示以暴露契约缺口，不伪造文案。                                                                                                                                                                                                                                                             |
| 模板迁移     | compatibility-check 路由已列出，但 request/response 与 migration Job Schema 尚未冻结。                              | 模板目录只读，只允许保存当前 pinned 模板的语义样式；不直接发送 `set_template`，不伪造兼容检查或迁移成功。                                                                                                                                                                                                                                |
| 知识可见性   | `/knowledge-access-evaluations` 在 Markdown 列出，但未冻结请求/响应 Schema。                                        | 可见性设置通过正式 `PATCH` 与 `If-Match` 持久化；UI 只显示来源返回的 policy，不宣称执行了额外访问评估。                                                                                                                                                                                                                                  |
| PDF 预览     | Render SSE、取消、轮询建议、产物过期恢复与 PdfSourceMap 交互仍未冻结。                                              | 两种宿主仅使用已确认的 Render Job 与 artifact；未生成 artifact 前显示语义预览，绝不伪造 PDF。                                                                                                                                                                                                                                            |
| PDF 下载地址 | 契约把 `download_url` 定义为短期签名 URI，但未约定可用 origin、重定向边界、浏览器 CSP/CORS 与桌面主进程的信任清单。 | 当前只接受已验证产品 API origin 下的 artifact content 路径，并在 Web/Electron 都拒绝任何重定向；若服务端改用对象存储/CDN 或 redirect，须先冻结并部署逐跳 allowlist、认证传播与宿主 transport，不能让主进程抓取任意后端返回的 URL。                                                                                                       |
| Agent 流     | SSE 鉴权、恢复游标、事件持久化、消息创建与 proposal 列表入口尚需端到端冻结。                                        | 消息 composer 保持禁用；不生成本地消息或 proposal，也不暴露缺少上游来源的孤立 decision 能力。                                                                                                                                                                                                                                            |
| 实时面试     | SDP/signaling handshake、重连窗口、`media_played_ack` 和 WebSocket binary fallback 的精确行为尚未冻结。             | REST 场景、会话与报告使用真实 API；客户端声明 realtime/media 能力不可用，并阻止创建无法继续的会话，不生成预置转录或本地重连成功。                                                                                                                                                                                                        |
| 身份与桌面端 | 契约要求除公开模板预览外使用 Bearer token，但授权端点、client ID、scope、回调 URI、刷新与注销生命周期尚未约定。     | Web/Desktop 不发送伪造 Bearer；当前受保护资源不能宣称生产可用，Desktop 也不以 Cookie 代替正式身份。                                                                                                                                                                                                                                      |
| 评估量表     | `InterviewReport` 只携带 `rubric_ref` 与分数；历史 `rubric_ref` 对应 rubric 的独立查询端点仍未冻结。                | 总结页仅用同一 session 所引用 scenario 内嵌的 rubric 解释报告，并严格校验 rubric id/version，以及每个已返回维度的身份唯一、存在于该 rubric 且分数不越界；任一不一致即拒绝展示。Schema 未要求报告覆盖全部 rubric 维度，前端不额外收紧。历史记录同样只在当前 scenario rubric 可验证时显示分数，不把 opaque ID 映射为名称，也不生成百分制。 |

## 新增契约能力的准入条件

1. 服务端对相应端点发布且冻结 Schema/OpenAPI entrypoint 与示例；
2. Web 与 Electron 对同一契约 fixture 通过契约验证；
3. 涉及权限、并发或实时传输时，补充失败、重连与审计行为测试；
4. 保持页面依赖 gateway port，避免把 transport 逻辑回流到 React 组件。

身份能力还必须额外满足：Web 采用已冻结的 Authorization Code + PKCE 配置；Electron 通过系统浏览器认证、在系统安全存储中保管 token，并由最小权限的主进程能力使用或签发短期 renderer 凭据。没有这些输入和端到端证据前，origin 配置、CORS、HTTP smoke 与不携带 Cookie 的 `session.fetch(credentials: 'omit')` 都不能被解释为 Bearer 认证。
