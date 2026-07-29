# Resume Agent Poll Timeout Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume Agent 状态查询发生单次 HTTP 超时时，继续追踪同一个 Run，避免把后端仍在执行的任务误报为失败。

**Architecture:** 在 `resume-assistant-gateway.ts` 的 Run 读取边界集中识别 `ApiV2NetworkError('timeout')`。只有该瞬时错误会按现有轮询生命周期重试；其他异常和 `AbortSignal` 原样传播。

**Tech Stack:** TypeScript 6、Vitest、现有 Resume Assistant Gateway 和 API v2 错误类型。

## Global Constraints

- 不修改全局 30 秒 HTTP 超时。
- 不创建第二个 Agent Run。
- 不修改 PDF、知识库、Proposal 决策或后端安全校验。
- 先运行失败测试，再写生产代码。

---

### Task 1: Resume Run 单次查询超时恢复

**Files:**

- Modify: `packages/product-runtime/src/resume-assistant-gateway.node.test.ts`
- Modify: `packages/product-runtime/src/resume-assistant-gateway.ts`

**Interfaces:**

- Consumes: `ApiV2NetworkError`、`ResumeAssistantAgentApi.getRun()`、现有 `AbortSignal`。
- Produces: Resume Run 查询只对 `kind === 'timeout'` 重试的内部读取函数。

- [ ] **Step 1: Write the failing test**

在现有 Proposal 测试旁增加一个测试：`createRun` 返回 running，第一次 `getRun` 抛出
`new ApiV2NetworkError('timeout')`，第二次返回同一 Run 的
`waiting_for_proposal_decision`，断言 `ask()` 最终返回原 Proposal 且只创建一次 Run。

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @ai-job-workspace/product-runtime test -- resume-assistant-gateway.node.test.ts
```

Expected: 新测试因 `ApiV2NetworkError('timeout')` 直接传播而失败。

- [ ] **Step 3: Write minimal implementation**

在 Gateway 内增加私有读取函数：

```ts
async function getRunRecoveringTimeout(
  api: ResumeAssistantAgentApi,
  input: UiResumeAssistantRequest,
  runId: string,
  retryDelayMilliseconds: number
): Promise<AgentRun>
```

该函数调用 `api.getRun()`；捕获错误时只允许
`error instanceof ApiV2NetworkError && error.kind === 'timeout'` 进入延迟重试，
其余错误原样抛出。`waitForRun()` 和 `waitForProposalContinuation()` 共用该函数。

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --filter @ai-job-workspace/product-runtime test -- resume-assistant-gateway.node.test.ts
pnpm --filter @ai-job-workspace/product-runtime typecheck
```

Expected: Resume Assistant Gateway 测试和 product-runtime 类型检查通过。

- [ ] **Step 5: Commit**

```powershell
git add -- packages/product-runtime/src/resume-assistant-gateway.ts packages/product-runtime/src/resume-assistant-gateway.node.test.ts docs/superpowers/plans/2026-07-29-resume-agent-poll-timeout-recovery.md
git commit -m "fix(resume): recover Agent Run polling timeouts"
```
