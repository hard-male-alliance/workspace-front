# Frontend Capability Audit

**Audit date:** 2026-07-22
**Frontend base:** `930972eec0a28d80046bb26274cd8f4322cd0430`
**Shared contract:** v2 at submodule `6e49248de3a8141d687697283e0f3e50e864025c`
**Backend evidence:** committed backend `5f0b2c83889f57a0b0e1fcf01a153509f4e0a59d`, plus separately identified uncommitted password-session work

## Status vocabulary

| Status            | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `REAL_API`        | The production composition reaches a currently evidenced backend capability.            |
| `PARTIAL`         | A real path exists, but a required part of the user journey is unavailable.             |
| `DISABLED`        | The product explicitly prevents an unsupported action and explains the limitation.      |
| `MOCK_ONLY`       | The capability exists only through test/development memory adapters.                    |
| `STATIC_FAKE`     | Static data is presented as live data.                                                  |
| `FAKE_SUCCESS`    | Success is reported without authoritative completion evidence.                          |
| `BROKEN_CONTRACT` | Production calls or DTO parsing conflict with current backend/shared-contract evidence. |
| `UNKNOWN`         | Available evidence is insufficient.                                                     |

`REAL_API` is not synonymous with “v2 compliant”. The current production adapters are v1 adapters. The published v2 standard is a migration target and is not deployed-backend evidence.

## Executive summary

- Production Web and Electron roots assemble HTTP Gateways; no production root imports an in-memory Gateway. This is a valid anti-fallback property.
- Application startup nevertheless depends on `/api/v1/me` and `/api/v1/workspaces`, neither of which exists in the committed backend. Consequently, the production application cannot currently reach its tenant pages from a clean startup.
- Every current product adapter uses v1 DTOs and `/api/v1`. The v2 tenant path, OAuth public-client lifecycle, v2 Problem/Page models, unified Job/Artifact/Event model, and realtime protocols are not implemented in the frontend.
- The Workspace session now requires an explicit user selection unless the authority response names a valid accessible default. Selection changes remount the active tenant route; the DOM regression proves that the Workspace-home Resume, Knowledge, and Interview reads rerun. The flow remains unreachable until startup authority is available.
- Resume, Knowledge, and Interview lists fetch v1 collections and filter by `workspace_id` in the client. Client filtering is not an authorization boundary and cannot represent v2 tenant routing.
- No production `STATIC_FAKE` or memory fallback was found. Several test-only flows are `MOCK_ONLY`. Unsupported feedback, Knowledge create, template migration, and realtime Interview controls are generally disabled or return explicit capability errors rather than reporting success.
- Web and Electron now explicitly declare the only implemented major (`v1`), and the shared composition rejects any other value. This is a fail-closed declaration guard around the existing fixed-v1 HTTP adapters, not a multi-profile adapter selector. Repository guidance identifies v2 as the migration standard without claiming that it is deployed.

## Capability matrix

| Capability                            | Status            | Priority | Web         | Electron    | Primary blocker                                                                                                                           |
| ------------------------------------- | ----------------- | -------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Host bootstrap/configuration          | `PARTIAL`         | P0       | same        | same        | Origin and explicit v1 profile resolve, but startup authority is absent.                                                                  |
| User authentication/login             | `BROKEN_CONTRACT` | P0       | unavailable | unavailable | No OAuth/OIDC/PKCE/Bearer client; local password-session work is uncommitted and incompatible with `credentials: omit`.                   |
| Current user authority                | `BROKEN_CONTRACT` | P0       | blocked     | blocked     | Frontend calls `/api/v1/me`; committed backend has no route; v2 DTO is incompatible.                                                      |
| Workspace access list                 | `BROKEN_CONTRACT` | P0       | blocked     | blocked     | Frontend calls `/api/v1/workspaces`; committed backend has no route; v2 returns `WorkspaceAccess`.                                        |
| Explicit Workspace selection          | `PARTIAL`         | P0       | implemented | implemented | Picker, validation, and invalidation exist, but the authority endpoints needed to populate it are absent.                                 |
| Workspace home aggregate              | `BROKEN_CONTRACT` | P0       | blocked     | blocked     | Startup authority fails; downstream collections are client-filtered v1 reads.                                                             |
| Resume list/entry                     | `BROKEN_CONTRACT` | P0       | blocked     | blocked     | Global v1 list plus client filter; no explicit tenant route.                                                                              |
| Resume detail/editor read             | `PARTIAL`         | P0       | unreachable | unreachable | Gateway now requires Workspace and rejects a cross-Workspace response, but the v1 route is not tenant-scoped and startup remains blocked. |
| Resume editing operations             | `BROKEN_CONTRACT` | P1       | unreachable | unreachable | Real v1 route exists; operation union differs from v2 and Workspace is absent.                                                            |
| Resume templates                      | `PARTIAL`         | P1       | unreachable | unreachable | v1 list exists; template-detail frontend path differs from current backend path.                                                          |
| Template migration                    | `DISABLED`        | P2       | disabled    | disabled    | No frozen/runtime migration capability; UI explains limitation.                                                                           |
| Resume render Job                     | `BROKEN_CONTRACT` | P1       | unreachable | unreachable | v1 domain Job differs from v2 unified Job and lacks Workspace route.                                                                      |
| PDF preview/download                  | `PARTIAL`         | P1       | unreachable | unreachable | Integrity checks are strong, but URLs are v1 and no Bearer-capable v2 artifact path exists.                                               |
| Knowledge list/detail                 | `BROKEN_CONTRACT` | P1       | blocked     | blocked     | v1 global list/client filter and v1 DTO (`config`) conflict with v2.                                                                      |
| Knowledge visibility update           | `PARTIAL`         | P1       | unreachable | unreachable | v1 PATCH/ETag exists; tenant path and v2 DTO are missing.                                                                                 |
| Knowledge create/upload/search        | `DISABLED`        | P2       | disabled    | disabled    | Create/upload contracts are not connected; UI does not claim completion.                                                                  |
| Interview history/setup               | `BROKEN_CONTRACT` | P1       | blocked     | blocked     | v1 global list/client filter and v1 create body conflict with v2.                                                                         |
| Interview realtime room               | `DISABLED`        | P1       | disabled    | disabled    | Product runtime declares no WebRTC/WebSocket-binary capability.                                                                           |
| Interview end/report                  | `PARTIAL`         | P1       | unreachable | unreachable | v1 reads exist; end success is intentionally withheld where response is unfrozen.                                                         |
| Conversation/Agent/Tool approval      | `UNKNOWN`         | P2       | no UI       | no UI       | Backend has partial v1 routes, but frontend has no Gateway/UI.                                                                            |
| Workspace Job/Artifact/Event/SSE      | `BROKEN_CONTRACT` | P1       | absent      | absent      | No unified v2 Gateways or SSE client; only v1 render polling exists.                                                                      |
| Diagnostics upload                    | `BROKEN_CONTRACT` | P1       | optional    | optional    | Frontend path and backend/Nginx path differ; protocol is outside product API v2.                                                          |
| Feedback action                       | `DISABLED`        | P3       | disabled    | disabled    | No backend capability; control is visibly/accessibly unavailable.                                                                         |
| Theme and locale preferences          | `REAL_API`        | P3       | local       | local       | Intentionally local host/UI behavior, no backend required.                                                                                |
| Test state galleries and memory flows | `MOCK_ONLY`       | —        | tests       | tests       | Correctly isolated from production composition.                                                                                           |

## Detailed evidence

### 1. Host bootstrap and API version

- **Route/page/action:** Web and Electron bootstrap.
- **Gateway/adapter:** `createProductGateways()` creates `HttpWorkspaceGateway`, `HttpResumeGateway`, `HttpKnowledgeGateway`, and `HttpInterviewGateway` around one `HttpClient`.
- **Source:** host-resolved public API origin; the HTTP client appends `/api/v1`.
- **Request/error behavior:** origin and CSP validation fail closed; startup renders `HostStartupFailure` for configuration failures.
- **Mock/fallback:** production has no memory adapter import and `fallbackTransport: 'none'` for Interview media.
- **Current boundary:** Web and Electron explicitly declare `apiMajor: 'v1'`; the product runtime rejects any other major. The option does not yet choose among multiple adapters—the only constructed adapters remain the existing v1 HTTP implementations. Do not instantiate v2 until its backend prerequisites exist.

### 2. Identity and Workspace authority

- **Route/page/action:** every route is nested under `WorkspaceShell`; shell calls `WorkspaceGateway.loadAccess()`.
- **Gateway/adapter:** `HttpWorkspaceGateway` calls `GET /api/v1/me` and paginated `GET /api/v1/workspaces`.
- **Source/evidence:** these routes are absent from committed backend `routes.py`. Current local password-session endpoints are uncommitted `/api/v1/auth/*` work and do not provide the frontend's current DTOs.
- **Request/error behavior:** network/404/contract failures become a retryable resource error. No login recovery action exists.
- **Contract break:** v2 requires OAuth public clients and Bearer access tokens. v2 current-user and `WorkspaceAccess` DTOs differ from current validators.
- **Mock behavior:** memory Workspace authority exists only in test harnesses.
- **Recommendation:** retain an identity/application port, show an explicit blocked state, and wait for frozen backend identity/Workspace evidence before claiming integration.

### 3. Workspace selection and cache isolation

- **Current behavior:** no Workspace is selected implicitly. A server-provided default is accepted only when it is present in the accessible set; otherwise the shell blocks tenant pages until the user chooses one.
- **User control:** the account area provides a Workspace picker. Selection validates membership, publishes a revision, and remounts tenant routes.
- **Invalidation:** when `refreshAccess()` is invoked, it clears inaccessible selections and reconciles a changed principal before notifying tenant consumers. No production identity lifecycle currently invokes this refresh because no production identity flow exists; principal-change isolation is therefore application-session behavior proven by a unit test, not an end-to-end login/logout claim.
- **Remaining risk:** the committed backend does not provide the current authority endpoints, so the picker cannot be populated in production. The selected ID is an application boundary, not proof of server-side authorization.

### 4. Resume read slice

- **Routes/actions:** `/resumes`, `/resumes/:resumeId/edit`, `/resumes/:resumeId/template`.
- **Gateway/adapter:** `listResumeCards(workspaceId)` still calls global `GET /api/v1/resumes`, then filters `workspace_id`; `getResumeEditor(workspaceId, resumeId)` and template settings now require Workspace explicitly in the port, HTTP adapter, memory adapter, pages, internal authority reload, and direct adapter tests. HTTP detail reads reject cross-Workspace response data.
- **Backend evidence:** v1 Resume list/detail routes exist. v2 requires `/api/v2/workspaces/{workspace_id}/resumes...`.
- **States:** entry and editor pages implement loading, empty/error where applicable, success, and retry.
- **Blocker:** unavailable startup authority and non-tenant-scoped v1 backend routes. Client filtering remains insufficient for list authorization.
- **Recommendation:** replace only the version-specific adapter after frozen tenant routes exist; keep the explicit Gateway parameters and page calls.

### 5. Resume writes, templates, render, and artifacts

- **Gateway/adapter:** v1 operation batch, template, render-job polling, and artifact-save paths are centralized outside pages.
- **Positive behavior:** ETag/If-Match, idempotency, outcome-unknown, conflict reload, duplicate-submit guards, cancellation cleanup, artifact media/size/SHA-256 validation, and Electron IPC boundaries are implemented.
- **Contract break:** current operations and style model are v1; v2 replaces operations and unifies Job/Artifact. Artifact save lacks Workspace and Bearer injection.
- **Fake-success check:** save/render UI reports success only after a parsed authoritative response or host save result. No production fake success was found.
- **Recommendation:** keep these v1-only and unreachable behind blocked authority; migrate as separate bounded-context work after v2 identity/Workspace.

### 6. Knowledge

- **Routes/actions:** library list, source visibility; add-source controls are disabled.
- **Gateway/adapter:** v1 HTTP list/detail/PATCH; list filters `workspace_id` client-side.
- **Contract break:** v1 `config`/ingestion and v2 `public_config`/Job models differ; tenant paths are absent.
- **Fake-success check:** unsupported add/upload does not report server success.
- **Recommendation:** preserve disabled create UI, remove claims of v2 readiness, and migrate read/PATCH only after explicit Workspace routing exists.

### 7. Interview

- **Routes/actions:** hub, setup, room, summary.
- **Gateway/adapter:** v1 HTTP scenario/session/report reads and session create; history filters by Workspace in the client.
- **Contract break:** create DTO sends v1 fields forbidden by v2. Realtime connection, media, transcript, and report Job are not implemented.
- **Honest behavior:** runtime advertises `webrtc: false` and `websocketBinary: false`; unsupported room/end actions return capability errors rather than fake completion.
- **Recommendation:** retain disabled behavior, version the v1 adapter, and do not expose realtime success until the connection lifecycle is implemented and tested.

### 8. Diagnostics

- **Current behavior:** local diagnostics are real and content-safe; optional upload has explicit configuration.
- **Mismatch:** frontend sends `/api/v1/frontend-diagnostics/batches`, while current backend/deployment evidence uses `/api/v1/diagnostics`.
- **Recommendation:** track and repair as a separate operational protocol. Diagnostics success must not be used as evidence that product API v2 works.

## Production Mock/fake search result

- Web and Electron production roots import only `createProductGateways`; no in-memory Gateway reaches production transitively through the composition root.
- Memory Gateways and static datasets are exported through testing paths and consumed by node/DOM/browser tests.
- Timers found in production code implement HTTP deadlines and render-job polling; they do not manufacture completed resources.
- No unconditional server-save success was found. Resume/Knowledge success messages follow validated HTTP results; artifact success follows the host save result.
- Disabled product capabilities found: feedback, Knowledge add source/upload, Resume template migration, and Interview realtime. Their controls/messages are explicit rather than hidden Mock behavior.

## Implementation reconciliation

- `createWorkspaceSession()` no longer treats list order as selection. It accepts a server default only when that ID is in the accessible set, rejects inaccessible explicit choices, and publishes a monotonic revision on selection invalidation.
- `WorkspaceShell` blocks its `Outlet` without a selection, wires the picker to the session, catches a rejected/stale picker choice, and remounts the active tenant route on revision changes.
- The Resume read boundary is strict for list, editor detail, and template-settings reads. Resume mutations, render commands, and the v1 global list route are **not** fully tenant-scoped; this audit continues to classify them as partial or broken rather than completed v2 work.
- `apiMajor` is a required v1 declaration and runtime guard. It neither enables v2 nor performs automatic fallback.
- `scripts/check-architecture.mjs` now excludes the repository-local `.tmp` directory so copied worktrees and dependency backups cannot be mistaken for production dependency-graph inputs. Its fixture test covers this exclusion; this is a quality-gate correction, not a product capability.

## Promotion criteria for the first slice

The startup → identity → Workspace → selection → Resume list → Resume detail slice can become `REAL_API` only when all of the following have executable evidence:

1. A committed/deployed identity flow supported by Web and Electron security constraints.
2. Current-user and Workspace-access endpoints with frozen DTOs.
3. Explicit Workspace authorization and tenant resource paths.
4. A versioned Resume list/detail adapter with runtime validation.
5. Loading, empty, error, retry, unauthorized, forbidden, not-found, and success tests against representative server fixtures.
6. No client-side tenant filtering, identity-header forgery, Mock fallback, or major-version fallback.

Until then, the production slice remains blocked and must say so.
