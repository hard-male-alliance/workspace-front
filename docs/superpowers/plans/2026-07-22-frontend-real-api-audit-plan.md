# Frontend Real-API Audit Implementation Plan

> **Execution note:** Work only on `fix/frontend-real-api-audit-20260722`. The user explicitly forbids commits, pushes, PRs, pulls, merges, rebases, resets, cleans, and stashes. References to commits in the generic planning workflow do not apply.

**Goal:** Make production capability truth auditable, replace implicit Workspace selection with an explicit session boundary, and carry Workspace identity through the first Resume read slice without claiming unavailable v2 integration.

**Architecture:** Keep React pages dependent on application Gateways. Extend the application-owned `WorkspaceSession` to hold explicit selection and notify React, while transport versioning remains in the production composition/HTTP adapter boundary. Keep current runtime adapters v1-only, prohibit fallback, and make v1 tenant limitations explicit. No v2 adapter is instantiated until backend identity, Workspace, and tenant routes exist.

**Execution reconciliation (2026-07-22):** This file is the proposed implementation plan, not a completion checklist. Tasks 2 and 3 were implemented for the current application session. Task 4 was completed only for Resume list input, editor detail, template-settings reads, and editor authority reload; mutation/render inputs and the v1 global-list/client-filter limitation remain open. Task 5 added a required v1 declaration and fail-closed guard around the existing fixed-v1 adapters, not a multi-profile adapter selector. See `docs/frontend-capability-audit.md` for the verified current state.

**Tech stack:** React 19, TypeScript 6, React Router, Vitest node/DOM/browser projects, pnpm workspace.

---

## Task 1: Establish the capability audit

**Files:**

- Create: `docs/frontend-capability-audit.md`
- Inspect: `apps/web/src/main.tsx`, `apps/desktop/src/renderer/src/main.tsx`, `packages/product-runtime/src/index.ts`, all context Gateways/adapters/pages

1. Inventory every user-visible capability and production dependency path.
2. Search production source for memory adapters, Mock/static fixtures, timers, fallback and unconditional success behavior.
3. Classify each capability with the approved status vocabulary and evidence fields.
4. Record committed-backend evidence separately from local uncommitted backend work.

## Task 2: Drive explicit Workspace selection with failing unit tests

**Files:**

- Modify: `packages/app/src/app/AppQueries.node.test.ts`
- Modify: `packages/app/src/app/AppQueries.ts`

1. Add failing tests proving no `.at(0)` selection, valid default preference, explicit `selectWorkspace`, invalid-selection rejection, and authority refresh invalidation.
2. Run the focused test and verify the expected failures.
3. Implement the smallest stateful `WorkspaceSession` API, including a selection revision/subscription hook suitable for React.
4. Re-run the focused test to green.

## Task 3: Drive Workspace picker and blocked states with DOM tests

**Files:**

- Modify: `packages/app/src/app/AppData.tsx`
- Modify: `packages/app/src/app/WorkspaceShell.tsx`
- Modify: `packages/app/src/app/AppData.dom.test.tsx` or focused shell integration tests
- Modify: `packages/app/src/i18n/resources.ts`
- Modify: existing shell/shared styles only if necessary

1. Add failing tests for no selected Workspace, multi-Workspace selection, selection change, and inaccessible authority.
2. Expose session selection through a React-safe hook without introducing a global state library.
3. Render an accessible Workspace selector when choices exist and an honest blocked/empty state otherwise.
4. Key route data by selection revision so stale Workspace results are not reused.
5. Re-run focused DOM tests to green.

## Task 4: Drive explicit Resume Workspace identity

**Files:**

- Modify: `packages/app/src/contexts/resume/application/gateway.ts`
- Modify: `packages/app/src/contexts/resume/infrastructure/http/gateway.node.test.ts`
- Modify: `packages/app/src/contexts/resume/infrastructure/http/gateway.ts`
- Modify: `packages/app/src/contexts/resume/infrastructure/memory/gateway.ts`
- Modify: affected Resume pages/tests

1. Add failing tests requiring `workspaceId` for Resume detail, template settings, mutations, render start/status, and authority reload where the addressed resource is tenant-owned.
2. Ensure v1 adapter responses are checked against the requested Workspace rather than treating client filtering as authorization.
3. Remove global-list-plus-client-filter behavior from the production Resume list path; when current v1 cannot express an explicit tenant request, fail with a named capability error instead of fabricating v2 semantics.
4. Keep memory adapters available only to tests and make them obey the same application signature.
5. Re-run Resume and application tests to green.

## Task 5: Make API-major/runtime truth explicit

**Files:**

- Modify: `packages/product-runtime/src/index.ts`
- Modify: `packages/product-runtime/src/index.node.test.ts`
- Modify: host API configuration tests if public option shape changes
- Modify: `README.md`, `CONTEXT.md`, `docs/contract-open-questions.md` only where needed

1. Add failing composition tests for one explicit v1 profile and no fallback.
2. Name the existing production adapter selection as v1 runtime while preserving base-origin validation.
3. Do not create a callable v2 profile; report it as blocked by missing backend prerequisites.
4. Update stale documentation to distinguish the v2 target standard from the current v1 runtime.

## Task 6: Repair misleading production behavior

**Files:**

- Modify only files identified by Task 1 evidence
- Add focused node/DOM tests beside each repaired behavior

1. Prioritize any `FAKE_SUCCESS`, `STATIC_FAKE`, or production Mock fallback found by the audit.
2. Replace unsupported operations with explicit disabled or capability-error behavior.
3. Preserve legitimate test fixtures and the product phrase “模拟面试”; do not confuse these with technical Mock data.

## Task 7: Focused and full verification

1. Report `node --version`, `pnpm --version`, and declared package manager.
2. Run each focused test in red and green phases.
3. Run `pnpm format:check`, `pnpm lint`, `pnpm check:contracts`, `pnpm check:architecture`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm smoke:desktop` as applicable.
4. If dependency/toolchain mismatch prevents trustworthy gates, do not reinstall or rewrite the lockfile without need; report exact failures and unverified scope.
5. Run `git diff --check`, inspect the complete diff, confirm submodule cleanliness, and report final status without committing.
