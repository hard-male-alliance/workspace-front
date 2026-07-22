# Web Local CSP Implementation Plan

> **Status: Archived.** This is a historical execution record, not a current implementation plan. [ADR 0002](../../adr/0002-protect-production-api-truth.md), the pinned shared contract, and current deployment documentation are authoritative.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the Web development page to connect to the local backend at `http://127.0.0.1:8000` without weakening unrelated CSP directives.

**Architecture:** Keep the API configuration and HTTP Gateway unchanged. Add the loopback HTTP source only to the Web HTML `connect-src` directive, guarded by a Vitest regression test that reads the shipped HTML configuration directly.

**Tech Stack:** HTML Content Security Policy, TypeScript 6, Vitest 4, pnpm workspace

## Global Constraints

- Do not modify any file under `workspace-back/`.
- Do not modify Electron CSP.
- Preserve all existing Web CSP sources and directives.
- Add only `http://127.0.0.1:*` to the Web `connect-src` directive.

---

### Task 1: Permit the local loopback backend in Web CSP

**Files:**

- Create: `apps/web/src/csp.test.ts`
- Modify: `apps/web/index.html:9`

**Interfaces:**

- Consumes: the literal CSP meta content in `apps/web/index.html`.
- Produces: a Web `connect-src` policy that accepts `http://127.0.0.1:*` while retaining `'self'`, `http://localhost:*`, and `ws://localhost:*`.

- [x] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Web Content Security Policy', (): void => {
  it('allows the configured 127.0.0.1 development API origin', (): void => {
    const html = readFileSync(resolve(process.cwd(), 'apps/web/index.html'), 'utf8')

    expect(html).toContain(
      "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:*"
    )
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test apps/web/src/csp.test.ts`

Expected: FAIL because the current `connect-src` does not contain `http://127.0.0.1:*`.

- [x] **Step 3: Write the minimal implementation**

Change the Web CSP fragment to:

```html
connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:*;
```

- [x] **Step 4: Run verification**

Run: `pnpm test apps/web/src/csp.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm format:check`

Expected: PASS.

- [x] **Step 5: Verify the live integration**

Refresh `http://127.0.0.1:5173/resumes` and `http://127.0.0.1:5173/knowledge`.

Expected: both pages load real backend data without the generic load-error state.

- [x] **Step 6: Commit**

```bash
git add apps/web/index.html apps/web/src/csp.test.ts docs/superpowers/plans/2026-07-20-web-local-csp.md
git commit -m "fix(web): allow loopback backend in CSP"
```
