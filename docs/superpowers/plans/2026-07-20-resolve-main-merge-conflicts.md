# Resolve Main Merge Conflicts Implementation Plan

> **Status: Archived.** This is a historical execution record, not a current implementation plan. [ADR 0002](../../adr/0002-protect-production-api-truth.md), the pinned shared contract, and current deployment documentation supersede its Mock composition and capability assumptions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the latest `hard-male-alliance/workspace-front` `main` into `feat/frontend-ui-refresh`, preserve the branch's completed frontend/backend-alignment work, and leave GitHub able to merge the PR automatically.

**Architecture:** Use a normal merge commit instead of rebasing the published PR branch, so existing commit SHAs remain stable and no force-push is required. Resolve overlapping files in favor of the branch's newer, runtime-validated HTTP stack, retain `main`'s explicit runtime Gateway composition, and remove the obsolete parallel `ApiClient`/`dto` implementation introduced by `main`.

**Tech Stack:** Git, pnpm 10.33.2, Node.js >=22.12.0, React 19, TypeScript 6, Vite 7, Vitest, ESLint, Prettier.

## Global Constraints

- Work only in `workspace-front/`; do not modify `workspace-back/`.
- Preserve all user changes; start with no changes other than this known untracked plan document.
- Do not rewrite the published feature-branch history and do not use `git push --force`.
- Keep `React -> AppGateways -> HTTP or Mock adapter` as the only data path.
- Keep the branch's `http-client.ts`, `transport-types.ts`, `validators.ts`, runtime validation, Problem Details handling, ETag handling, cancellation, and polling behavior.
- Do not retain two HTTP client/DTO stacks after the merge.
- Do not invent new endpoint paths, headers, DTOs, authentication behavior, or streaming semantics while resolving conflicts.
- Do not use `lint:fix` or whole-repository formatting to resolve style failures.
- Temporary artifacts, if needed, must stay under the repository-root `.tmp/` directory.

---

## File Map and Resolution Ownership

### Keep the feature branch as the canonical version

- `apps/web/.env.example`
- `apps/web/src/api-config.ts`
- `apps/web/src/api-config.test.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/vite-env.d.ts`
- `docs/web-deployment.md`
- `packages/app/src/domain/gateways.ts`
- `packages/app/src/domain/models.ts`
- `packages/app/src/domain/pending.ts`
- `packages/app/src/features/knowledge/KnowledgePage.tsx`
- `packages/app/src/features/resume/ResumeEditorPage.tsx`
- `packages/app/src/features/resume/ResumeWorkspace.tsx`
- `packages/app/src/features/workspace/WorkspaceHomePage.tsx`
- `packages/app/src/i18n/resources.ts`
- `packages/app/src/infrastructure/http/http-knowledge-gateway.ts`
- `packages/app/src/infrastructure/http/http-resume-gateway.ts`
- `packages/app/src/infrastructure/http/index.ts`
- `packages/app/src/infrastructure/http/mappers.ts`
- `packages/app/src/infrastructure/mock/mock-gateways.ts`
- `packages/app/src/infrastructure/mock/mock-gateways.test.ts`
- `packages/app/src/styles/app.css`

These branch versions are strict supersets of the corresponding `main` work: they include the later resume proposal/render flows, knowledge upload/search/polling, runtime DTO validation, and user-visible error handling.

### Merge manually

- `packages/app/src/app/WorkspaceApp.test.tsx`: retain all branch test cases, but adapt their test wrapper to `main`'s required `gateways` prop.
- `packages/app/src/index.ts`: retain exactly one `export * from './infrastructure/http'` statement.

### Retain the clean auto-merge from `main`

- `apps/desktop/src/renderer/src/main.tsx`: keep explicit Mock Gateway construction for Electron.
- `packages/app/src/app/WorkspaceApp.tsx`: keep `gateways: AppGateways` required, while retaining the branch's `/resumes` route and `ResumeEntryPage`.
- `packages/app/src/app/WorkspaceShell.tsx`: keep the `/resumes` navigation target from the feature branch.

### Remove after merging

- `packages/app/src/infrastructure/http/api-client.ts`
- `packages/app/src/infrastructure/http/api-client.test.ts`
- `packages/app/src/infrastructure/http/dto.ts`

These files are `main`'s older parallel transport stack. The feature branch already provides the more complete `http-client.ts`, `http-client.test.ts`, `transport-types.ts`, `validators.ts`, and `validators.test.ts` implementation.

---

### Task 1: Freeze and verify the merge inputs

**Files:**

- Inspect only: repository and Git refs

**Interfaces:**

- Consumes: local `feat/frontend-ui-refresh`, `origin/feat/frontend-ui-refresh`, and `upstream/main`
- Produces: a clean, recoverable starting point with recorded SHAs

- [ ] **Step 1: Verify the worktree is clean**

Run:

```powershell
git status --short --branch
```

Expected: branch `feat/frontend-ui-refresh` and no modified, staged, or untracked files except `docs/superpowers/plans/2026-07-20-resolve-main-merge-conflicts.md` if the plan has not yet been committed.

- [ ] **Step 2: Refresh both remotes**

Run:

```powershell
git fetch --prune origin
git fetch --prune upstream
```

Expected: `origin/feat/frontend-ui-refresh` and `upstream/main` resolve successfully.

- [ ] **Step 3: Confirm the feature branch matches its published head**

Run:

```powershell
git rev-parse HEAD
git rev-parse origin/feat/frontend-ui-refresh
git rev-parse upstream/main
```

Expected before any newer user commits: the first two SHAs match; the known diagnostic values were feature head `f70e174` and main head `ed5bb7e` on 2026-07-20.

- [ ] **Step 4: Create a local recovery branch**

Run:

```powershell
git branch backup/feat-frontend-ui-refresh-before-main-sync-20260720 HEAD
```

Expected: `git branch --list 'backup/feat-frontend-ui-refresh-before-main-sync-20260720'` prints the backup branch.

### Task 2: Start the merge and verify the expected conflict set

**Files:**

- Modify: Git index and the 22 known conflict files

**Interfaces:**

- Consumes: clean feature branch and refreshed `upstream/main`
- Produces: an uncommitted merge state ready for deterministic resolution

- [ ] **Step 1: Start a non-fast-forward merge without committing**

Run:

```powershell
git merge --no-ff --no-commit upstream/main
```

Expected: Git stops with conflicts; it must not create a merge commit yet.

- [ ] **Step 2: Capture the actual unmerged set**

Run:

```powershell
git diff --name-only --diff-filter=U
```

Expected: 22 paths. If `upstream/main` advanced and the list differs, stop and re-run the read-only `git merge-tree --write-tree upstream/main HEAD` diagnosis before choosing either side for any new path.

- [ ] **Step 3: Confirm recovery works without using it**

Run:

```powershell
git status --short --branch
git rev-parse backup/feat-frontend-ui-refresh-before-main-sync-20260720
```

Expected: status reports an active merge, and the backup SHA equals the pre-merge feature head. If resolution becomes unsafe, recover with `git merge --abort`.

### Task 3: Resolve Web configuration and the HTTP adapter boundary

**Files:**

- Modify: all Web configuration and HTTP adapter files listed in “Keep the feature branch as the canonical version”
- Delete: `packages/app/src/infrastructure/http/api-client.ts`
- Delete: `packages/app/src/infrastructure/http/api-client.test.ts`
- Delete: `packages/app/src/infrastructure/http/dto.ts`

**Interfaces:**

- Consumes: `resolveApiBaseUrl(...)`, `createWebGateways(apiBaseUrl)`, `createHttpClient(...)`
- Produces: one runtime-validated HTTP stack exported from `packages/app/src/infrastructure/http/index.ts`

- [ ] **Step 1: Select the feature-branch Web configuration**

Run:

```powershell
git checkout --ours -- apps/web/.env.example apps/web/src/api-config.test.ts apps/web/src/api-config.ts apps/web/src/main.tsx apps/web/src/vite-env.d.ts docs/web-deployment.md
git add apps/web/.env.example apps/web/src/api-config.test.ts apps/web/src/api-config.ts apps/web/src/main.tsx apps/web/src/vite-env.d.ts docs/web-deployment.md
```

Expected: Web keeps `resolveApiBaseUrl`, `ApiConfigurationError`, `createWebGateways`, and `WebConfigurationErrorPage`; it does not instantiate `ApiClient` directly.

- [ ] **Step 2: Select the feature-branch Gateway implementations**

Run:

```powershell
git checkout --ours -- packages/app/src/infrastructure/http/http-knowledge-gateway.ts packages/app/src/infrastructure/http/http-resume-gateway.ts packages/app/src/infrastructure/http/index.ts packages/app/src/infrastructure/http/mappers.ts
git add packages/app/src/infrastructure/http/http-knowledge-gateway.ts packages/app/src/infrastructure/http/http-resume-gateway.ts packages/app/src/infrastructure/http/index.ts packages/app/src/infrastructure/http/mappers.ts
```

Expected `packages/app/src/infrastructure/http/index.ts` content:

```ts
/** @brief 只读 HTTP adapter 公开入口 / Public entrypoint for read-only HTTP adapters. */
export * from './http-client'
export * from './http-knowledge-gateway'
export * from './http-resume-gateway'
```

- [ ] **Step 3: Remove the obsolete parallel main implementation**

Run:

```powershell
git rm packages/app/src/infrastructure/http/api-client.ts packages/app/src/infrastructure/http/api-client.test.ts packages/app/src/infrastructure/http/dto.ts
```

Expected: no production import references `ApiClient`, `./api-client`, or `./dto`.

- [ ] **Step 4: Verify the transport boundary has one implementation**

Run:

```powershell
rg -n "ApiClient|api-client|from './dto'|from \"./dto\"" apps packages
rg -n "createHttpClient|transport-types|validators" apps packages
```

Expected: the first command returns no matches; the second finds the feature branch's HTTP client, DTO boundary, validators, Gateway constructors, Web composition, and tests.

- [ ] **Step 5: Run the narrow HTTP/config tests**

Run:

```powershell
pnpm test -- apps/web/src/api-config.test.ts apps/web/src/create-web-gateways.test.ts packages/app/src/infrastructure/http/http-client.test.ts packages/app/src/infrastructure/http/http-gateways.test.ts packages/app/src/infrastructure/http/mappers.test.ts packages/app/src/infrastructure/http/validators.test.ts
```

Expected: all selected Vitest files pass.

### Task 4: Resolve domain models, feature pages, mocks, localization, and CSS

**Files:**

- Modify: the domain, feature, mock, i18n, and CSS conflict files listed below

**Interfaces:**

- Consumes: the feature branch's expanded `ResumeGateway`, `KnowledgeGateway`, UI models, and pending-contract records
- Produces: pages and mocks that match those exact domain interfaces

- [ ] **Step 1: Select the feature-branch domain boundary**

Run:

```powershell
git checkout --ours -- packages/app/src/domain/gateways.ts packages/app/src/domain/models.ts packages/app/src/domain/pending.ts
git add packages/app/src/domain/gateways.ts packages/app/src/domain/models.ts packages/app/src/domain/pending.ts
```

Expected: resume proposal/render and knowledge upload/search/ingestion operations remain represented by typed business methods, not generic transport calls.

- [ ] **Step 2: Select the feature-branch pages and styles**

Run:

```powershell
git checkout --ours -- packages/app/src/features/knowledge/KnowledgePage.tsx packages/app/src/features/resume/ResumeEditorPage.tsx packages/app/src/features/resume/ResumeWorkspace.tsx packages/app/src/features/workspace/WorkspaceHomePage.tsx packages/app/src/i18n/resources.ts packages/app/src/styles/app.css
git add packages/app/src/features/knowledge/KnowledgePage.tsx packages/app/src/features/resume/ResumeEditorPage.tsx packages/app/src/features/resume/ResumeWorkspace.tsx packages/app/src/features/workspace/WorkspaceHomePage.tsx packages/app/src/i18n/resources.ts packages/app/src/styles/app.css
```

Expected: the branch's loading/empty/error/submitting/cancellation flows, `/resumes` entry workflow, knowledge polling bounds, and current visual design remain intact.

- [ ] **Step 3: Select matching Mock adapters and tests**

Run:

```powershell
git checkout --ours -- packages/app/src/infrastructure/mock/mock-gateways.ts packages/app/src/infrastructure/mock/mock-gateways.test.ts
git add packages/app/src/infrastructure/mock/mock-gateways.ts packages/app/src/infrastructure/mock/mock-gateways.test.ts
```

Expected: Mock methods satisfy the same expanded Gateway signatures used by the real HTTP adapters.

- [ ] **Step 4: Run the narrow domain and feature tests**

Run:

```powershell
pnpm test -- packages/app/src/infrastructure/mock/mock-gateways.test.ts packages/app/src/features/knowledge/knowledge-errors.test.ts packages/app/src/features/knowledge/knowledge-polling.test.ts packages/app/src/features/workspace/WorkspaceHomePage.test.tsx
```

Expected: all selected tests pass.

### Task 5: Reconcile explicit runtime composition and application tests

**Files:**

- Modify: `packages/app/src/app/WorkspaceApp.test.tsx`
- Inspect: `packages/app/src/app/WorkspaceApp.tsx`
- Inspect: `apps/desktop/src/renderer/src/main.tsx`
- Modify: `packages/app/src/index.ts`

**Interfaces:**

- Consumes: required `WorkspaceAppProps.gateways: AppGateways`
- Produces: explicit Web/Electron composition and isolated default Mock Gateways in tests only

- [ ] **Step 1: Keep the branch test coverage, then add a test-only wrapper**

Start from the branch file:

```powershell
git checkout --ours -- packages/app/src/app/WorkspaceApp.test.tsx
```

Change its direct `WorkspaceApp` import to `WorkspaceApp as SharedWorkspaceApp`, import `WorkspaceAppProps`, and add this wrapper after imports:

```tsx
type TestWorkspaceAppProps = Omit<WorkspaceAppProps, 'gateways'> & {
  readonly gateways?: WorkspaceAppProps['gateways']
}

function WorkspaceApp({ gateways, ...props }: TestWorkspaceAppProps): React.JSX.Element {
  return (
    <SharedWorkspaceApp
      {...props}
      gateways={
        gateways ?? {
          workspace: new MockWorkspaceGateway(),
          resume: new MockResumeGateway(),
          interview: new MockInterviewGateway(),
          knowledge: new MockKnowledgeGateway()
        }
      }
    />
  )
}
```

Then stage the file:

```powershell
git add packages/app/src/app/WorkspaceApp.test.tsx
```

Expected: tests without a `gateways` prop receive fresh Mocks, while tests that inject failing or custom Gateways keep their explicit instances.

- [ ] **Step 2: Verify the auto-merged application root**

Run:

```powershell
rg -n "readonly gateways: AppGateways|ResumeEntryPage|path=\"/resumes\"|createMockGateways|gateways \?\?" packages/app/src/app/WorkspaceApp.tsx
```

Expected: required `gateways`, `ResumeEntryPage`, and `/resumes` are present; `createMockGateways` and `gateways ??` are absent from production application code.

- [ ] **Step 3: Verify explicit Electron composition**

Run:

```powershell
rg -n "MockWorkspaceGateway|MockResumeGateway|MockInterviewGateway|MockKnowledgeGateway|gateways=" apps/desktop/src/renderer/src/main.tsx
```

Expected: all four explicit Mock Gateways and the `gateways` prop are present. Electron remains Mock-backed and does not acquire a browser-side secret or direct external-model connection.

- [ ] **Step 4: Remove the duplicate HTTP barrel export**

Ensure `packages/app/src/index.ts` contains exactly one block:

```ts
/** @brief 真实 HTTP 基础设施导出 / Real HTTP infrastructure exports. */
export * from './infrastructure/http'
```

Run:

```powershell
git add packages/app/src/index.ts
rg -n "export \* from './infrastructure/http'" packages/app/src/index.ts
```

Expected: exactly one match.

- [ ] **Step 5: Run the application integration tests**

Run:

```powershell
pnpm test -- packages/app/src/app/WorkspaceApp.test.tsx apps/web/src/WebConfigurationErrorPage.test.tsx apps/web/src/csp.test.ts
```

Expected: all selected tests pass, including custom Gateway failure paths and Web configuration failure rendering.

### Task 6: Audit the completed merge for hidden semantic conflicts

**Files:**

- Inspect: every staged file
- Modify only: files necessary to correct a failed audit or test

**Interfaces:**

- Consumes: resolved Git index
- Produces: no unmerged entries, no conflict markers, no duplicate infrastructure, and no accidental loss of main-only cross-platform changes

- [ ] **Step 1: Confirm every Git conflict is resolved**

Run:

```powershell
git diff --name-only --diff-filter=U
git ls-files -u
```

Expected: both commands print nothing.

- [ ] **Step 2: Scan for conflict markers and whitespace damage**

Run:

```powershell
rg -n "^(<<<<<<<|=======|>>>>>>>)" . --glob '!node_modules/**' --glob '!.git/**'
git diff --check --cached
```

Expected: no conflict markers and no whitespace errors.

- [ ] **Step 3: Review the staged merge instead of trusting `--ours` mechanically**

Run:

```powershell
git diff --cached --stat
git diff --cached -- apps/desktop/src/renderer/src/main.tsx packages/app/src/app/WorkspaceApp.tsx packages/app/src/index.ts packages/app/src/infrastructure/http apps/web/src
```

Expected: explicit runtime composition from `main` is present; feature-branch HTTP validation and workflows are present; the obsolete main HTTP stack is absent.

- [ ] **Step 4: Verify the conflict-resolution invariant**

Run:

```powershell
git grep -n -E "ApiClient|api-client|from './dto'|from \"./dto\"" -- ':!docs/**'
git grep -n "createHttpClient" -- apps packages
```

Expected: no obsolete client/DTO matches; the canonical client is created only in the infrastructure/composition boundary and its tests.

### Task 7: Run the complete frontend gates and create the merge commit

**Files:**

- Modify: Git history only after every gate passes

**Interfaces:**

- Consumes: fully resolved and staged merge
- Produces: one tested merge commit whose first parent is the feature branch and second parent is `upstream/main`

- [ ] **Step 1: Run formatting verification**

Run:

```powershell
pnpm format:check
```

Expected: PASS. If only manually edited files fail, format only those exact files with Prettier and inspect their diffs before staging.

- [ ] **Step 2: Run static checks**

Run:

```powershell
pnpm lint
pnpm typecheck
```

Expected: both commands pass with zero warnings/errors.

- [ ] **Step 3: Run all tests**

Run:

```powershell
pnpm test
```

Expected: all Vitest suites pass.

- [ ] **Step 4: Build Web and Electron and run the desktop smoke test**

Run:

```powershell
pnpm build
pnpm smoke:desktop
```

Expected: Web and desktop builds succeed; desktop packaging/runtime smoke checks pass.

- [ ] **Step 5: Create the merge commit**

Run:

```powershell
git add docs/superpowers/plans/2026-07-20-resolve-main-merge-conflicts.md
git status --short --branch
git commit -m "merge: reconcile frontend refresh with upstream main"
```

Expected: one merge commit is created only after all checks pass.

### Task 8: Prove the PR is mergeable and publish normally

**Files:**

- Modify: `origin/feat/frontend-ui-refresh` only when pushing is authorized

**Interfaces:**

- Consumes: tested merge commit
- Produces: a PR head containing the latest `upstream/main` ancestry

- [ ] **Step 1: Verify ancestry and local mergeability**

Run:

```powershell
git merge-base --is-ancestor upstream/main HEAD
git merge-tree --write-tree upstream/main HEAD
```

Expected: both commands exit 0; `merge-tree` prints a tree ID and no `CONFLICT` lines.

- [ ] **Step 2: Review the final history**

Run:

```powershell
git log --oneline --decorate --graph -n 25
git status --short --branch
```

Expected: the merge commit has both histories; the worktree is clean and the local branch is ahead of `origin/feat/frontend-ui-refresh`.

- [ ] **Step 3: Push without rewriting history**

Run only after explicit authorization:

```powershell
git push origin feat/frontend-ui-refresh
```

Expected: normal push succeeds; no `--force` or `--force-with-lease` is needed.

- [ ] **Step 4: Confirm the GitHub PR state**

Refresh the PR page and confirm that GitHub no longer reports “This branch has conflicts that must be resolved.” If GitHub has not recomputed immediately, compare the displayed head SHA with local `git rev-parse HEAD` before diagnosing further.

---

## Rollback

Before the merge commit:

```powershell
git merge --abort
```

After the merge commit but before pushing, do not reset destructively. Create a corrective commit or ask for explicit approval to restore from `backup/feat-frontend-ui-refresh-before-main-sync-20260720`.

## Expected Final State

- `upstream/main` is an ancestor of `feat/frontend-ui-refresh`.
- Git reports no unmerged files or conflict markers.
- Web uses the branch's validated `createHttpClient` and real Resume/Knowledge HTTP Gateways.
- Electron explicitly uses Mock Gateways.
- `WorkspaceApp` requires runtime Gateway injection.
- Exactly one HTTP client/DTO/validation stack remains.
- The full `pnpm check` equivalent passes.
- The PR can be pushed normally and GitHub can merge it automatically.
