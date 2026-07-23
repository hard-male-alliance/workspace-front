# Frontend Quality Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reproducible frontend-only typecheck, Node, DOM, browser, build, architecture, contract, artifact, and Electron smoke gates without depending on a running backend or uncommitted backend identity work.

**Architecture:** Preserve separate compiler environments: Electron main/preload and build configuration remain pure Node, renderer production remains DOM-aware, and Node-hosted tests that import frontend source receive a dedicated DOM/Vite test compiler profile. Keep `.mjs` repair limited to the proven Windows checkout/loading boundary, and install Playwright's repository-pinned Chromium outside Git-tracked paths.

**Tech Stack:** Node.js 22.20.0, pnpm 10.33.2, TypeScript 6.0.3, Vitest 4.1.10, Playwright 1.61.1, React 19, Vite 7.

## Global Constraints

- Do not read, run, cite, or depend on uncommitted backend identity changes.
- All frontend gates must run without starting the backend.
- Do not modify `workspace-back/` or `workspace-shared-docs/`.
- Do not implement OAuth/OIDC/PKCE, fake login, fixed Bearer tokens, v2 adapters, new business flows, or product pages.
- Do not delete, skip, or weaken tests; do not add `any`, `@ts-ignore`, new `skipLibCheck`, or broad source exclusions.
- Do not reset, clean, stash, rebase, push, or open a pull request.
- Avoid lockfile changes unless a gate proves they are necessary.

---

### Task 1: Separate pure-Node and frontend Node-test compiler environments

**Files:**

- Modify: `tsconfig.node.json`
- Create: `tsconfig.frontend-node-tests.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: existing strict compiler options from `tsconfig.json`.
- Produces: a pure-Node runtime program, a DOM/Vite-aware Node-test program, and the existing renderer program, all executed by `pnpm typecheck`.

- [ ] **Step 1: Preserve the failing baseline**

Run:

```text
corepack pnpm typecheck
```

Expected before the fix: exit 2 from the first TypeScript program, with missing `document`, `window`, DOM event properties, and CSS side-effect declarations in frontend modules imported by Node tests.

- [ ] **Step 2: Prove the renderer profile is already correct**

Run:

```text
node node_modules/typescript/bin/tsc -p tsconfig.renderer.json --noEmit --pretty false
```

Expected: exit 0.

- [ ] **Step 3: Keep `tsconfig.node.json` pure Node**

Its includes must remain limited to `vitest.config.ts`, app config files, Electron main/preload production code, and Electron main/preload Node tests. Its `lib` remains `ES2023`; its `types` remain `node` and `vitest/globals`.

- [ ] **Step 4: Add the frontend Node-test profile**

Create `tsconfig.frontend-node-tests.json` extending `tsconfig.json` with:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client", "vitest/globals"]
  },
  "include": [
    "apps/web/src/**/*.node.test.ts",
    "apps/web/src/**/*.node.test.tsx",
    "packages/**/*.node.test.ts",
    "packages/**/*.node.test.tsx"
  ],
  "exclude": ["node_modules", "dist", "out", "coverage", "workspace-shared-docs"]
}
```

`vite/client` supplies the established CSS side-effect declarations only to frontend tests; no ambient CSS wildcard is added to pure Node.

- [ ] **Step 5: Run all three compiler profiles**

Update `package.json` so `typecheck` runs `tsconfig.node.json`, `tsconfig.frontend-node-tests.json`, then `tsconfig.renderer.json`. Run `corepack pnpm typecheck`; expected exit 0.

### Task 2: Repair the two Windows `.mjs` Vitest loading failures

**Files:**

- Create: `.gitattributes`
- Normalize only if proven: `scripts/check-contracts.mjs`
- Normalize only if proven: `scripts/check-contracts.node.test.mjs`
- Normalize only if proven: `scripts/check-production-artifacts.mjs`
- Normalize only if proven: `scripts/check-production-artifacts.node.test.mjs`

**Interfaces:**

- Consumes: the existing Vitest Node project and existing failing suites.
- Produces: stable LF checkout semantics for only the affected ESM loader boundary.

- [ ] **Step 1: Preserve the exact failing test**

Run:

```text
node node_modules/vitest/vitest.mjs run --project node scripts/check-contracts.node.test.mjs scripts/check-production-artifacts.node.test.mjs
```

Expected before the fix: two suites fail during import with `SyntaxError: Invalid or unexpected token`, zero tests registered.

- [ ] **Step 2: Keep syntax and byte evidence**

Run `node --check` on both tests and implementations, scan for BOM/control characters, and inspect `git ls-files --eol`. Expected: syntax and bytes are valid; the affected files are `i/lf w/crlf`, while the passing architecture `.mjs` pair is `w/lf`.

- [ ] **Step 3: Test the smallest checkout normalization**

Normalize only the contracts test+implementation to LF and rerun only the contracts suite. If it passes, normalize only the artifact test+implementation and rerun only the artifact suite. If either remains red, stop and continue loader diagnosis instead of broadening line-ending changes.

- [ ] **Step 4: Persist the proven boundary**

Add exact `.gitattributes` rules:

```gitattributes
/scripts/check-contracts.mjs text eol=lf
/scripts/check-contracts.node.test.mjs text eol=lf
/scripts/check-production-artifacts.mjs text eol=lf
/scripts/check-production-artifacts.node.test.mjs text eol=lf
```

Do not normalize unrelated repository files.

- [ ] **Step 5: Verify both suites together**

Run the exact command from Step 1; expected exit 0 with both files and all existing tests passing.

### Task 3: Restore the Playwright Chromium environment

**Files:**

- No tracked source or lockfile changes expected.
- Browser cache remains under Playwright's user cache and must not be committed.

**Interfaces:**

- Consumes: repository Playwright 1.61.1 and Vitest browser project.
- Produces: locally runnable Chromium desktop/mobile browser instances.

- [ ] **Step 1: Preserve the environment failure**

Run `corepack pnpm test:browser`; expected before installation: missing `chromium_headless_shell-1228`, with no product test executed.

- [ ] **Step 2: Install only the required browser**

Run:

```text
node node_modules/playwright/cli.js install chromium
```

If network or permissions block installation, retain the exact error as an environment blocker; do not skip tests or alter product code.

- [ ] **Step 3: Run browser tests**

Run `corepack pnpm test:browser`; expected exit 0 for both desktop and mobile instances.

### Task 4: Regression and full frontend-only gates

**Files:**

- Modify only files proven necessary by Tasks 1–3.
- Do not access backend sources or services.

**Interfaces:**

- Consumes: the committed Workspace/Resume/API-major/production-composition regression tests.
- Produces: reproducible green frontend gates.

- [ ] **Step 1: Run focused Workspace/Resume/runtime tests**

Run the five Node files and four DOM files used before commit. Expected: 5/5 Node files and 4/4 DOM files pass; Workspace explicit selection, default validation, illegal selection, switching, principal invalidation, Resume Workspace reads, cross-Workspace rejection, API-major guard, and production composition remain covered.

- [ ] **Step 2: Run all required gates**

Run, separately and record each exit code:

```text
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm build
corepack pnpm check:architecture
corepack pnpm check:contracts
corepack pnpm check:artifacts
corepack pnpm smoke:desktop
corepack pnpm format:check
git diff --check
```

- [ ] **Step 3: Confirm no backend dependency**

Verify no backend process was started, no backend file was read or modified, and no frontend test requires a backend origin or identity endpoint.

- [ ] **Step 4: Commit the quality baseline**

After all code-resolvable gates pass, commit only the quality-baseline files with:

```text
fix(tooling): restore reproducible frontend quality gates
```

Do not push.
