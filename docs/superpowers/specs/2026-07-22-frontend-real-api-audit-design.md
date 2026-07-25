# Frontend Real-API Audit and Honest Boundary Design

**Date:** 2026-07-22
**Branch:** `fix/frontend-real-api-audit-20260722`
**Base:** `930972eec0a28d80046bb26274cd8f4322cd0430`

## 1. Purpose

This change audits every user-visible frontend capability against its actual production data path, then repairs the smallest safe boundary needed to stop the application from implying that unavailable identity, Workspace, or tenant-scoped capabilities work.

The shared v2 contract is the published target standard. It is not evidence that the current backend has deployed `/api/v2`. The committed backend currently exposes `/api/v1` product routes and does not expose the `/me` and `/workspaces` startup authority expected by the frontend. Local uncommitted backend password-session work is in progress and is not a dependency of this frontend branch.

## 2. Non-goals

- Do not modify the backend or `workspace-shared-docs` submodule.
- Do not implement speculative OAuth/OIDC, PKCE, token storage, or `/api/v2` calls.
- Do not mechanically rewrite `/api/v1` paths to `/api/v2`.
- Do not add a silent v1, Mock, memory, or static-data fallback.
- Do not migrate every bounded context to v2 in this change.
- Do not claim end-to-end integration without a backend implementation and executable evidence.
- Do not commit, push, or open a pull request.

## 3. Evidence and authority order

Decisions use the following evidence in order:

1. The four read-only v2 publications in `workspace-shared-docs/contracts/v2/` define the target standard.
2. Committed backend routes and models define currently available server behavior.
3. Frontend production composition defines what users actually execute.
4. Tests and memory adapters prove isolated frontend behavior only; they do not prove production capability.
5. Uncommitted backend files are reported as work in progress, not treated as a frozen contract.

Conflicts are recorded rather than resolved by invention.

## 4. Capability audit model

Create `docs/frontend-capability-audit.md`. Each capability is assigned one status:

- `REAL_API`: production composition reaches a backend capability supported by current evidence.
- `PARTIAL`: part of the user journey is real, but a required step or state is unavailable.
- `DISABLED`: the UI explicitly prevents the operation and explains why.
- `MOCK_ONLY`: available only through test/development memory adapters.
- `STATIC_FAKE`: static data is presented as if it were live.
- `FAKE_SUCCESS`: the UI reports success without authoritative completion evidence.
- `BROKEN_CONTRACT`: production code calls a path or parses a DTO that current evidence cannot support.
- `UNKNOWN`: evidence is insufficient.

Every row records the route/page, user action, Gateway, production adapter, data source, request and response evidence, error behavior, Mock/static behavior, Web/Electron status, blocker, recommendation, and priority. The audit includes startup, identity, Workspace, Resume, templates/render/artifacts, Knowledge, Interview, diagnostics, and host-specific capabilities.

## 5. Runtime truth and version boundary

API major version must be explicit in host configuration and production composition. A bounded context selects one named adapter profile; an adapter never tries another version after failure.

The existing adapters remain clearly identified as v1 runtime adapters until migrated. The v2 target is documented but not instantiated. Base-origin configuration remains separate from path-version selection, preventing page components from constructing transport URLs.

If the code already expresses the version sufficiently through a single v1 client boundary, prefer a minimal naming/configuration change over duplicating the transport stack. Tests must prove that no request silently falls back to another major version or memory adapter.

## 6. Identity and Workspace boundary

The application must not manufacture a principal or Workspace. Startup authority remains a Gateway operation. When the configured backend does not implement that authority, the shell presents an explicit, retryable blocked state with safe diagnostics and does not render tenant resource routes as usable.

Workspace selection becomes explicit application state:

- access data contains the current user and all accessible Workspaces;
- no Workspace is chosen merely because it is the first list item;
- a valid server-provided default may be used only as an initial UI preference, never as authorization proof;
- the user can select among accessible Workspaces;
- selection is validated against the current access set;
- principal/access reload invalidates selection when it is no longer valid;
- Workspace-dependent queries are keyed by the selected Workspace and do not reuse results across selections.

No production page sends `X-Mock-*` or trusted-proxy assertion headers. The local backend's development identity mechanism stays a deployment/entry-boundary concern.

## 7. First vertical slice

The intended slice is:

```text
host startup
→ identity authority
→ accessible Workspaces
→ explicit Workspace selection
→ Resume list for that Workspace
→ Resume detail for that same Workspace
```

Because committed backend evidence lacks startup authority, this branch may complete the transport boundary, validators, selection state, blocked state, and tests but must not label the slice `REAL_API`.

Resume domain operations that address tenant resources receive `workspaceId` explicitly where required, including detail and authority reload. The presentation layer passes the selected Workspace through the domain Gateway; it does not construct paths.

The v1 Resume adapter must not fetch a global collection and perform client-side Workspace filtering as if that were tenant authorization. If the backend route is already scoped by trusted identity but cannot accept explicit Workspace context, the adapter reports that limitation honestly and remains version-specific. It cannot satisfy the v2 tenant-path contract.

The slice exposes loading, empty, success, error, retry, invalid-selection, and unavailable-authority states. Route changes and component unmounts cancel or ignore obsolete work using the existing async-resource lifecycle.

## 8. Misleading and fake behavior repair

Production composition is searched for memory adapters, inline fixtures, timers, fallback data, unconditional success messages, and disabled controls that still fire actions.

Repairs follow this order:

1. Remove or block fake success.
2. Prevent production Mock/static fallback.
3. Replace ambiguous errors with explicit unavailable/blocked states.
4. Disable unsupported actions while preserving an accessible explanation.
5. Keep legitimate product terminology such as “模拟面试” distinct from technical Mock data.

Test harnesses may continue using memory Gateways, but their success proves UI state handling only and is labeled accordingly in the audit.

## 9. Error and state behavior

Transport errors remain inside infrastructure adapters and are mapped to application-safe failures. Pages receive no raw DTOs, HTTP paths, authentication headers, or backend stack details.

The current v1 Problem parser remains version-specific. v2 Problem parsing is not mixed into it until a v2 adapter exists. Contract-invalid responses remain hard failures; they never trigger another adapter. Technical diagnostics contain only low-cardinality metadata and no token, prompt, resume content, URL query, or user free text.

## 10. Test-driven implementation

Production changes follow red-green-refactor. Expected test areas are:

- Workspace session starts unselected and validates selection.
- A server default is only an initial preference when it exists in accessible Workspaces.
- Access/principal changes clear invalid selection and Workspace-keyed caches.
- Workspace routes render blocked, loading, empty, error, and success states correctly.
- Resume list/detail Gateway calls carry the selected `workspaceId`.
- Production composition contains no memory fallback.
- Version selection is explicit and no major-version fallback occurs.
- Unsupported capabilities do not emit success UI.
- Web and Electron production roots share the same truth semantics.

Existing tests are adapted only where the domain signature changes. New fixtures are labeled v1 or v2 and are not shared across incompatible DTOs.

## 11. Documentation outcome

Alongside the capability audit, update only frontend documentation that would otherwise contradict the implemented boundary. Documentation must distinguish:

- v2 published target standard;
- current v1 runtime implementation;
- current backend deployment evidence;
- Mock/test-only behavior;
- prerequisites for promoting a capability to `REAL_API`.

Historical v1 decisions may remain, but are labeled as runtime/history rather than the current shared standard.

## 12. Verification and delivery

Before running gates, report the actual Node and pnpm versions and dependency state. Use the repository's declared toolchain when available. Run focused failing/passing tests during development, then the applicable frontend gates: format check, lint, architecture/contract checks, typecheck, tests, build, and desktop smoke when host assembly changes.

Failures caused by unavailable dependencies, environment mismatch, or unrelated ignored worktrees are reported precisely and are not presented as product regressions. The final report includes Git baseline, environment, backend/contract evidence, audit summary, files changed, vertical-slice result, Mock status, checks, remaining blockers, and final Git status.
