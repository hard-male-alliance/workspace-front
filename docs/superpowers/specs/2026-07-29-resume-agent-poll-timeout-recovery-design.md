# Resume Agent 状态查询超时恢复设计

## 问题

Resume Agent Run 仍在后端执行时，单次 `GET agent-runs/{run_id}` 可能超过前端统一的
30 秒 HTTP 截止时间。当前轮询会直接失败并显示“当前简历没有被修改”，但后端随后仍
可能成功保存 Proposal，导致刷新前后状态矛盾。

## 范围

- 只修改 Resume Assistant 的 Run 与 Proposal 续答轮询。
- 不改变全局 HTTP 超时、后端执行安全上限、Proposal 决策、知识库或 PDF 流程。
- 不创建替代 Run；始终恢复同一个已持久化 Run ID。

## 设计

轮询读取 Run 时，仅把 `ApiV2NetworkError` 且 `kind === 'timeout'` 视为可恢复的瞬时
状态。发生这种错误后继续使用现有退避间隔重新读取同一个 Run。

以下错误不重试并保持现有行为：

- 用户取消或页面卸载；
- 认证失败；
- 契约解析失败；
- 明确的 HTTP Problem；
- 后端返回的 Agent 终态失败。

Run 恢复标识继续保存在现有恢复存储中。刷新、路由切换或组件卸载仍通过现有
`AbortSignal` 释放轮询。

## 测试

新增最小回归测试：

1. `ask` 首次读取 Run 时发生单次网络超时，随后同一 Run 返回
   `waiting_for_proposal_decision`，最终应返回对应 pending Proposal。
2. Proposal 决策提交后的续答首次读取超时，随后同一 Run 成功，续答应正常闭环。

只运行 Resume Assistant Gateway 定向测试和必要的前端类型检查，不运行全量测试。
