# v0.1.0 契约待确认项

本文件不定义、替代或修改 `contract/` 中的正式前后端契约。Web 对已由后端实现并逐项核对的子集装配 `Http*Gateway`，Electron 仍装配名字明确的 `Mock*Gateway`；未冻结条目不得被当作可调用接口。

## 已确认的边界

- `contract/ai-job-workspace.contract.schema.json` 是唯一的机器可读正式契约；其版本为 `1.0.0`。
- 简历的权威数据是语义中间表示（Semantic Intermediate Representation, SIR）；前端不得提交 HTML、CSS、LaTeX 或模板渲染器内部指令。
- 模板页面只表达 `TemplateManifest` 与 `ResumeStyleIntent` 中的语义意图。
- 面试以 REST 资源、实时 JSON 控制面和 WebRTC 媒体面分层；v0.1 不模拟或伪造它们的网络协议。
- 知识访问默认拒绝，必须以 `KnowledgeVisibilityPolicy` 和会话选择共同决定。
- 当前 Web 已接入知识文件直传、版本直传、摄取 Job 查询和知识搜索；页面只依赖 `KnowledgeGateway`，临时响应包装被限制在 HTTP adapter 内。
- Resume 写入遇到 409/412 时，前端锁定后续写入并显式重读权威资源，不自动重放本地修改。

## 待服务端冻结

| 范围         | 待确认项                                                                                                | v0.1 前端处理                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| HTTP DTO     | 仍有部分列表、创建、更新端点在 Schema 中没有逐端点 request/response entrypoint。                        | 只接入已由路由、模型和契约共同确认的子集；其余继续走 Mock。    |
| 知识文件上传 | 当前 direct multipart 路径及 202 `{ source, ingestion_job }` 包装仍是临时绑定；UploadSession 尚未冻结。 | Web 经 HTTP adapter 直传并有界轮询；Electron 经同端口 Mock。   |
| 知识搜索     | `/knowledge-searches` 的临时 `{ items }` 包装、分页和授权审计尚未冻结为完整路径契约。                   | 临时包装只存在于 HTTP adapter；页面消费领域搜索结果。          |
| 模板本地化   | `TemplateManifest.label_key` / `description_key` 的翻译提供方、版本与回退规则未定义。                   | mock 使用本地 `template.*` i18n key；真实 key 保留为待接入。   |
| 知识可见性   | `/knowledge-access-evaluations` 在 Markdown 列出，但未冻结请求/响应 Schema。                            | UI 只呈现本地 policy 预览，不显示“服务端有效策略”结论。        |
| PDF 预览     | Render SSE、取消、轮询建议、产物过期恢复与 PdfSourceMap 交互仍未冻结。                                  | Web 使用已确认的 Job/artifact 路由；Electron 使用三段式 Mock。 |
| Agent 流     | SSE 流的鉴权、恢复游标、事件持久化与 proposal 细节尚需端到端验证。                                      | 展示确定性的 mock 消息和 proposal；不实现 wire client。        |
| 实时面试     | SDP/signaling handshake、重连窗口、`media_played_ack` 和 WebSocket binary fallback 的精确行为尚未冻结。 | 仅渲染本地面试状态机与模拟转录，绝不发送媒体帧。               |
| 身份与桌面端 | token 获取、OAuth/deep-link 回调、可信 origin 和生产 CSP 尚未约定。                                     | Desktop 只暴露无敏感的 runtime-info bridge。                   |
| 评估量表     | 历史 `rubric_ref` 对应 rubric 的查询端点与分数尺度待确定。                                              | 只显示 mock 的相对分数与置信度，避免擅自宣称百分制。           |

## 替换 mock 的准入条件

1. 服务端对相应端点发布且冻结 Schema/OpenAPI entrypoint 与示例；
2. Web 与 Electron 对同一契约 fixture 通过契约验证；
3. 涉及权限、并发或实时传输时，补充失败、重连与审计行为测试；
4. 保持页面依赖 gateway port，避免把 transport 逻辑回流到 React 组件。
