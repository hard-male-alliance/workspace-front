# Resume Assistant Recovery State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Resume proposal acceptance, Agent continuation, refresh recovery, and real-PDF recovery truthful and durable.

**Architecture:** Preserve existing Gateways and introduce a small discriminated-union reducer for
frontend command state. On the backend, reproduce the persisted continuation sequence and classify
deterministic preflight failures as terminal rather than retryable.

**Tech Stack:** React 19, TypeScript 6, Vitest, FastAPI, Python 3.14, pytest, PostgreSQL, XeLaTeX.

## Global Constraints

- Do not change the phase-one authoritative PDF selection policy.
- Do not switch XeLaTeX to Mock.
- Do not weaken ETag, revision, operation, Proposal, or Workspace validation.
- Use TDD: run each new test red before production changes.
- Run only one to three targeted tests per task.
- Commit each task independently; do not push.

---

### Task 1: Persisted Agent continuation lifecycle

**Files:**

- Modify: `workspace-back/tests/test_v2_agent_persistence.py`
- Modify only after RED identifies the boundary: `workspace-back/src/backend/application/agent_v2.py`
- Modify only after RED identifies persistence drift: `workspace-back/src/backend/infrastructure/agent_v2.py`

**Interfaces:**

- Consumes: existing `AgentWorkerService`, PostgreSQL Agent UoW, Proposal decision outbox.
- Produces: a reloadable succeeded Run whose history supports the next Run.

- [ ] Add a persistence test that executes Proposal wait, acceptance, continuation, Run reload, and a second Run.
- [ ] Run the single pytest node and record the exact failing invariant.
- [ ] Apply the smallest correction at the demonstrated boundary.
- [ ] Re-run the single node and the nearest existing continuation test.
- [ ] Commit as `fix(agent): keep proposal continuations reloadable`.

### Task 2: Deterministic worker failure classification

**Files:**

- Modify: `workspace-back/tests/test_v2_agent_application.py`
- Modify: `workspace-back/tests/test_v2_outbox_dispatch.py`
- Modify: `workspace-back/src/backend/application/agent_v2.py`
- Modify: `workspace-back/src/backend/application/outbox_dispatch.py`

**Interfaces:**

- Consumes: `AgentDomainError`, `AgentPortProtocolError`, `ProblemDetails`.
- Produces: stable terminal Problems and safe `failure_stage`/`error_code` diagnostics.

- [ ] Add a failing test proving a deterministic preflight invariant is not retried.
- [ ] Run the exact test and verify repeated dispatch is the failure.
- [ ] Convert deterministic preflight failures into a terminal Run/Job result.
- [ ] Keep transient provider/infrastructure errors retryable.
- [ ] Run the focused application and dispatch tests.
- [ ] Commit as `fix(agent): stop retrying deterministic preflight failures`.

### Task 3: Frontend command state machine

**Files:**

- Create: `packages/app/src/contexts/resume/presentation/resume-assistant-machine.ts`
- Create: `packages/app/src/contexts/resume/presentation/resume-assistant-machine.test.ts`
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`

**Interfaces:**

- Consumes: existing `UiResumeAssistantThread`, Proposal authority, continuation result.
- Produces: `ResumeAssistantCommandState` and pure `resumeAssistantTransition`.

- [ ] Add reducer tests for submit, Proposal wait, decision commit, continuation success, and continuation failure.
- [ ] Run the reducer test red.
- [ ] Implement the minimal discriminated union and reducer.
- [ ] Wire `ResumeWorkspace` to the reducer without changing Gateway transport.
- [ ] Run reducer and Resume editor DOM tests.
- [ ] Commit as `fix(resume): model assistant commands explicitly`.

### Task 4: Independent refresh hydration

**Files:**

- Modify: `packages/product-runtime/src/resume-assistant-gateway.node.test.ts`
- Modify: `packages/product-runtime/src/resume-assistant-gateway.ts`
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `packages/app/src/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**

- Consumes: exact recovery envelope and existing Agent/Conversation APIs.
- Produces: messages even when command recovery fails, plus a separately recoverable command status.

- [ ] Add a failing test where Run recovery fails but Conversation messages still hydrate.
- [ ] Run it red.
- [ ] Separate thread reads from Run recovery and retain safe recovery metadata.
- [ ] Add DOM coverage for accepted-edit continuation failure copy.
- [ ] Run the two focused frontend test files.
- [ ] Commit as `fix(resume): decouple thread and run recovery`.

### Task 5: Proxy errors and exact PDF recovery

**Files:**

- Modify: `.tmp/local-api-proxy.mjs` only if promoted to a tracked development script.
- Modify: `packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx`
- Modify: the nearest existing Resume preview test.

**Interfaces:**

- Consumes: exact render Job identifier and allowed development Origin.
- Produces: CORS-readable 502 Problems and exact Job restoration.

- [ ] Add a proxy smoke test for upstream failure headers and Problem body.
- [ ] Add a PDF test proving exact Job restoration while revision-only candidates remain ambiguous.
- [ ] Run both red.
- [ ] Implement safe proxy error projection and exact recovery-envelope persistence.
- [ ] Run the focused proxy/PDF tests.
- [ ] Commit proxy and PDF changes separately when they reside in different repositories.

### Task 6: Resume aggregate title semantics

**Files:**

- Modify only after payload-layer reproduction: the relevant provider/tool mapping test and implementation.

**Interfaces:**

- Consumes: provider Resume operation draft.
- Produces: an operation that targets the authoritative Resume aggregate title.

- [ ] Reproduce the exact title request through the provider/tool adapter.
- [ ] Assert which layer first changes `resume title` into another semantic field.
- [ ] Add a failing test at that layer.
- [ ] Implement the smallest mapping/schema correction without keyword matching.
- [ ] Run the focused operation and invalid-operation guard tests.
- [ ] Commit as `fix(agent): preserve resume title operation semantics`.

### Task 7: Final verification and process restart

- [ ] Run the focused backend lifecycle and retry tests.
- [ ] Run the focused frontend reducer, Gateway, DOM, and PDF tests.
- [ ] Verify both Git worktrees contain only intended commits.
- [ ] Restart backend, local proxy, and frontend from the latest commits.
- [ ] Perform health, HTTP, and one real XeLaTeX smoke check.
