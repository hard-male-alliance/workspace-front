# Resume Proposal State Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development and execute each task in order. This task is executed inline because the user explicitly requested immediate completion without delegation.

**Goal:** Complete stage five so a committed Resume Proposal exposes the authoritative editor immediately and its Agent continuation survives refresh through a visible terminal state.

**Architecture:** Keep Proposal commit and Agent continuation as two ordered operations. The backend validates and dispatches the durable outbox envelope; the frontend persists an opaque continuation handle and reloads the authoritative thread after the Run terminates.

**Tech Stack:** Python 3.14, FastAPI application services, SQLAlchemy outbox adapter, pytest, React 19, TypeScript 6, Vitest.

## Global Constraints

- Preserve the four stage-one frontend commits and the authoritative real-PDF preview behavior.
- Keep the real XeLaTeX backend configuration; do not add Mock PDF behavior.
- Do not weaken identity, revision, envelope, or concurrency validation.
- Run only one to three targeted tests plus necessary smoke checks.
- Do not push.

---

### Task 1: Parse the durable Proposal decision envelope

**Files:**
- Modify: `workspace-back/src/backend/application/agent_worker.py`
- Test: `workspace-back/tests/test_v2_resume_core.py`

**Interfaces:**
- Consumes: `_PostgresResumeOutbox.add(ResumeOutboxEvent)`
- Produces: `_proposal_decision_claim(OutboxDispatchClaim) -> _AgentProposalDecisionClaim`

- [x] Add an integration regression test that serializes a real Resume event and passes it to `_proposal_decision_claim`.
- [x] Run the test and verify `agent.proposal_decision_event_invalid`.
- [ ] Parse the standard `{actor_id, subject, data}` envelope while preserving exact field, actor, subject, decision, and revision checks.
- [ ] Run the focused test and the mismatch-envelope test.
- [ ] Commit the backend stage-five change.

### Task 2: Authorize and terminalize the resumed Agent Run

**Files:**
- Modify only the files proven necessary by focused failures under `workspace-back/src/backend/application/agent_v2.py`, `workspace-back/src/backend/domain/agent_v2.py`, or their existing ports/adapters.
- Test: `workspace-back/tests/test_v2_agent_application.py`

**Interfaces:**
- Consumes: `AgentProposalDecisionClaim`
- Produces: one resumed or explicit terminal Agent Run

- [ ] Run the existing committed-Proposal continuation test against current `main`.
- [ ] If it fails, port only the relevant tested hunks from `0e922d9`, `ea11c42`, and `6c41f58`.
- [ ] Verify accepted, rejected, and superseded terminal behavior with the smallest focused selection.
- [ ] Amend or add a separate backend commit only if production code beyond Task 1 is required.

### Task 3: Expose committed editor before observing continuation

**Files:**
- Modify: `packages/app/src/contexts/resume/application/gateway.ts`
- Modify: `packages/product-runtime/src/api-v2-gateways.ts`
- Modify: `packages/product-runtime/src/resume-assistant-gateway.ts`
- Test: `packages/product-runtime/src/resume-assistant-gateway.node.test.ts`

**Interfaces:**
- Produces: `UiResumeAssistantProposalDecisionResult` with committed decision and continuation handle.
- Produces: `waitForProposalContinuation(...)` with thread and terminal problem code.

- [ ] Add a regression test asserting the committed editor is returned before continuation polling.
- [ ] Run it and verify it fails because `decideProposal` still waits.
- [ ] Split commit from observation using the existing Gateway boundary.
- [ ] Run the focused Gateway tests.

### Task 4: Recover continuation after refresh and expose progress

**Files:**
- Modify: `packages/product-runtime/src/resume-assistant-gateway.ts`
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Test: `packages/product-runtime/src/resume-assistant-gateway.node.test.ts`
- Test: `packages/app/src/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**
- Persists: `{runId, waitingOutputMessageId}` in `sessionStorage`.
- Clears: recovery only after a terminal Run.

- [ ] Add a regression test that aborts after commit, reconstructs the Gateway, and expects final messages after recovery.
- [ ] Run it and verify the accepted continuation is lost.
- [ ] Port the compatible non-PDF behavior from `8ab6e0e`, `a85014b`, and `9789831`.
- [ ] Verify immediate editor update, visible progress, refresh recovery, and terminal problem display.
- [ ] Run targeted typecheck/lint for changed frontend files and commit the frontend stage-five change.

### Task 5: Runtime smoke and handoff

**Files:** No production files.

- [ ] Restart the backend so the corrected worker claims the existing retryable event.
- [ ] Confirm health endpoints and inspect content-free logs for completion rather than `agent.proposal_decision_event_invalid`.
- [ ] Confirm both repositories contain only intended commits and pre-existing temporary files.
- [ ] Report root-cause evidence, files, targeted tests, commit hashes, and manual acceptance steps; stop before stage six.

