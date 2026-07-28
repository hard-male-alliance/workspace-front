# 简历 Proposal 状态闭环设计

## 目标

修复 Proposal 接受后“简历已提交但界面长期不变、刷新后 Proposal 与进度消失”的问题，并完成阶段五。沿用现有 `ResumeProposalStatus` 与 `AgentRunStatus`，不引入新的状态管理库。

## 状态与不变量

- `proposal=pending`：允许接受或拒绝。
- `proposal=accepted` 且 Run 未终结：已提交的 Resume revision 立即成为编辑器权威状态；界面显示后续处理进度；刷新后继续观察同一个 Run。
- `run=succeeded`：读取最终对话资源，清除恢复句柄。
- `run=failed|cancelled|expired`：保留已提交的 Resume revision，显示明确失败终态，清除恢复句柄。
- `proposal=rejected`：不修改 Resume，继续观察同一个 Run，直至显示拒绝后的最终回复或失败终态。
- 旧 Run 被新 Run 替代时，不得覆盖更新后的编辑器状态，并显示明确的 superseded 终态。

## 数据流

1. 后端接受 Proposal，在同一事务中提交 Proposal 状态、Resume revision 和 `agent.proposal_decision.recorded` outbox 事件。
2. worker 严格校验标准 outbox envelope 的 `actor_id`、`subject` 与 `data`，据此恢复原 Agent Run。
3. 前端 Proposal 决策请求只等待权威 Resume 提交结果，并立即更新编辑器。
4. Agent continuation 作为独立可恢复步骤运行；其 Run 句柄写入 `sessionStorage`，页面刷新后继续观察。
5. 只有 continuation 进入终态后才清除恢复句柄。

## 错误处理

- 不放宽后端封闭字段、身份或资源 revision 校验。
- continuation 失败不回滚已经成功提交的 Resume。
- 前端不得伪造成功；等待、失败与 superseded 必须可见。
- 不修改阶段一的真实 PDF 权威展示策略。

## 验证

- 后端：真实 PostgreSQL outbox adapter 序列化的 Proposal decision 能被真实 worker parser 接受；不匹配 envelope 仍被拒绝。
- 前端：决定提交结果先于 continuation 返回；刷新后恢复 accepted/rejected continuation；终态后清理恢复句柄。
- 页面：接受后立即采用权威 editor，并显示处理中与明确终态。

