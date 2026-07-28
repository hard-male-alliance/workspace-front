# Resume Save and Render Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让连续保存复用正确的 Resume ETag，并让 PDF 生成始终等待最新中栏修改保存完成。

**Architecture:** 后端 operation 响应继续返回完整结果，但 ETag 明确绑定结果中的 Resume 表示。前端复用现有页面级 mutation lane，增加等待当前写入完成和读取最新权威 editor 的窄接口；显式权威重载通过现有 reload revision 重置子编辑器草稿。

**Tech Stack:** Python 3.14、FastAPI、pytest、React 19、TypeScript 6、Vitest、Testing Library。

## Global Constraints

- 不修改 XeLaTeX、PDF Artifact 内容或权威 PDF 展示策略。
- 不删除或放宽 ETag/If-Match 并发保护。
- 不修改简历 Agent、知识库、模拟面试或其他页面。
- 每个 bugfix 严格执行 RED → GREEN。

---

### Task 1: Resume operation ETag

**Files:**

- Modify: `workspace-back/src/backend/api/v2_transport.py`
- Modify: `workspace-back/src/backend/api/v2_resumes.py`
- Test: `workspace-back/tests/test_v2_resumes_http.py`

**Interfaces:**

- Consumes: `replayable_json(payload, status_code, etag=True)`
- Produces: `replayable_json(..., etag_representation=payload["resume"])`

- [ ] **Step 1: Write the failing test**

在 HTTP 测试中对同一 Resume 连续提交两个 operation。第二次请求直接使用第一次 operation 响应的 `ETag`，断言状态为 200 且 revision 再增加 1。

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_v2_resumes_http.py -k operation_etag -q`

Expected: 第二次 operation 返回 412。

- [ ] **Step 3: Write minimal implementation**

为 `replayable_json` 增加可选的 `etag_representation: JsonValue | None`；仅在 Resume operation 路由传入 `payload["resume"]`，其他调用行为不变。

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_v2_resumes_http.py -k operation_etag -q`

Expected: PASS。

- [ ] **Step 5: Commit**

```text
git commit -m "fix(resume): return document etag after operations"
```

### Task 2: Serialize editor save before PDF render

**Files:**

- Modify: `workspace-front/packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `workspace-front/packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx`
- Test: `workspace-front/packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**

- Produces: 页面级 `awaitResumeMutation(): Promise<UiResumeEditorModel | null>`
- Consumes: Preview 在创建 Render Job 前调用该接口并使用返回 authority 的 revision。

- [ ] **Step 1: Write the failing test**

模拟 profile 保存 Promise 未完成；修改输入后立即点击生成，断言保存完成前未创建 Render Job，保存完成后只创建一次且 revision 是保存后的 revision。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-job-workspace/app exec vitest run tests/integration/WorkspaceApp.resume-editor.dom.test.tsx -t "waits for the latest field save before rendering PDF"`

Expected: Render Job 使用旧 revision 或过早创建。

- [ ] **Step 3: Write minimal implementation**

页面 mutation lane 保存当前 Promise 与最新 editor ref；Preview 的 render target 由生成开始前取得的最新权威 editor 构造。保存失败时返回 null 并停止生成。

- [ ] **Step 4: Run test to verify it passes**

运行 Step 2 同一命令，Expected: PASS。

### Task 3: Reset drafts on authoritative reload and expose dirty state

**Files:**

- Modify: `workspace-front/packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `workspace-front/packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx`
- Test: `workspace-front/packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**

- Produces: `onDraftStateChange(hasDrafts: boolean)`。
- Consumes: Preview 的 stale 状态包含 `hasDrafts`。

- [ ] **Step 1: Write the failing tests**

一条测试证明权威重载后中栏显示服务器值；另一条证明存在未保存草稿时不把 PDF 表述为最新内容。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ai-job-workspace/app exec vitest run tests/integration/WorkspaceApp.resume-editor.dom.test.tsx -t "authoritative reload|unsaved semantic draft"`

Expected: 草稿仍遮蔽服务器值，或成功文案未区分本地草稿。

- [ ] **Step 3: Write minimal implementation**

将 `authorityReloadRevision` 纳入 `ResumeSectionsEditor` key；子编辑器通过 effect 报告草稿状态；Preview 将该状态纳入 stale 提示。

- [ ] **Step 4: Run tests to verify they pass**

运行 Step 2 同一命令，Expected: PASS。

- [ ] **Step 5: Run focused regression tests and commit**

Run:

```text
pnpm --filter @ai-job-workspace/app exec vitest run tests/integration/WorkspaceApp.resume-editor.dom.test.tsx
pnpm --filter @ai-job-workspace/app typecheck
```

Commit:

```text
git commit -m "fix(resume): serialize saves before PDF rendering"
```
