# PR #2 Backend Contract Alignment Implementation Plan

> **Status: Archived.** This is a historical execution record, not a current implementation plan. [ADR 0002](../../adr/0002-protect-production-api-truth.md), the pinned shared contract, and current deployment documentation supersede its Mock composition and capability assumptions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb the non-duplicated configuration work from PR #2 and finish the Web frontend's Knowledge and Resume contract alignment without modifying `workspace-back/`.

**Architecture:** Keep the existing `HttpClient` as the only browser transport boundary. `apps/web` resolves public endpoint configuration and injects mixed Gateways; `packages/app` exposes stable domain intents, validates unknown transport data inside HTTP adapters, and keeps React pages transport-agnostic. Knowledge upload, ingestion polling, version replacement, search, and Resume conflict recovery are separate test-driven vertical slices.

**Tech Stack:** Node.js 22.12+, pnpm workspace, React 19, TypeScript 6, Vite 7, Vitest 4, Testing Library, React Router, i18next.

## Global Constraints

- Modify only `workspace-front/`; treat `workspace-back/` as read-only evidence.
- Preserve the current `feat/frontend-ui-refresh` commits and unrelated user changes; never use destructive Git commands or bulk formatting.
- Keep `React -> domain Gateway -> Mock/HTTP adapter -> workspace-back`; React components must not call `fetch`.
- Keep one HTTP implementation (`HttpClient`); do not add PR #2's parallel `ApiClient`.
- Never send `X-Mock-*` or `X-AIWS-*` identity headers and never place secrets in `VITE_*` variables.
- Use `FormData` without manually setting multipart `Content-Type` or boundary.
- Validate external values as `unknown` at the adapter boundary before mapping to `Ui*` models.
- Use test-first red-green-refactor for every behavior change.
- Put temporary files only in repository-root `.tmp/`; this plan requires no temporary files.
- Do not claim end-to-end completion without shared-backend smoke evidence.
- Use the local binaries below to avoid pnpm dependency self-install in this non-interactive environment:

```powershell
node node_modules\vitest\vitest.mjs run <test-path> --configLoader runner
node node_modules\vite\bin\vite.js build --configLoader runner
```

---

## File Structure

### New files

- `apps/web/src/api-config.ts`: normalize legacy and PR #2 endpoint environment inputs into one public origin.
- `apps/web/src/api-config.test.ts`: configuration precedence, defaults, validation, and conflict tests.
- `packages/app/src/features/knowledge/knowledge-errors.ts`: map structured HTTP/contract/network errors to non-sensitive UI messages.
- `packages/app/src/features/knowledge/knowledge-polling.ts`: bounded, abortable ingestion polling independent of React.
- `packages/app/src/features/knowledge/knowledge-polling.test.ts`: polling terminal, timeout, and cancellation tests.

### Modified files

- `apps/web/src/main.tsx`: resolve endpoint configuration and compose existing Gateways.
- `apps/web/src/create-web-gateways.ts`: accept a normalized origin only; retain the single `HttpClient` composition point.
- `apps/web/src/create-web-gateways.test.ts`: assert mixed Gateway composition without duplicating endpoint parsing tests.
- `apps/web/src/WebConfigurationErrorPage.tsx`: describe both supported public configuration forms.
- `apps/web/src/WebConfigurationErrorPage.test.tsx`: cover accessible, non-sensitive configuration recovery copy.
- `apps/web/src/vite-env.d.ts`: declare the four public configuration variables.
- `apps/web/.env.example`: document mutually exclusive complete-origin and split settings.
- `docs/web-deployment.md`: document SPA fallback plus API endpoint selection.
- `packages/app/src/domain/models.ts`: Knowledge upload, job, search, and input display models.
- `packages/app/src/domain/gateways.ts`: stable Knowledge business methods with `AbortSignal`.
- `packages/app/src/domain/pending.ts`: retain upload/search wrapper and visibility-write contract gaps.
- `packages/app/src/infrastructure/http/http-client.ts`: add `postForm()` while preserving JSON behavior.
- `packages/app/src/infrastructure/http/http-client.test.ts`: multipart, signal, status, and Problem Details tests.
- `packages/app/src/infrastructure/http/transport-types.ts`: transport-only Knowledge upload/job/search DTOs.
- `packages/app/src/infrastructure/http/validators.ts`: strict runtime parsers for new DTOs.
- `packages/app/src/infrastructure/http/validators.test.ts`: malformed/unknown/missing-field cases.
- `packages/app/src/infrastructure/http/mappers.ts`: transport-to-domain Knowledge mappings.
- `packages/app/src/infrastructure/http/mappers.test.ts`: upload/job/search mapping fixtures.
- `packages/app/src/infrastructure/http/http-knowledge-gateway.ts`: upload, version, job, and search endpoints.
- `packages/app/src/infrastructure/http/http-gateways.test.ts`: method/path/body/header/mapping boundary tests.
- `packages/app/src/infrastructure/mock/mock-gateways.ts`: satisfy the expanded domain port for Story/Test/Electron.
- `packages/app/src/infrastructure/mock/mock-gateways.test.ts`: deterministic upload/job/search behavior.
- `packages/app/src/features/knowledge/KnowledgePage.tsx`: real Gateway-driven upload, polling, version, refresh, and search states.
- `packages/app/src/app/WorkspaceApp.test.tsx`: Knowledge interaction, duplicate-submit, real source ID, and unmount cancellation coverage.
- `packages/app/src/features/resume/ResumeEditorPage.tsx`: expose authoritative reload after 409/412.
- `packages/app/src/features/resume/ResumeWorkspace.tsx`: prevent stale-revision follow-up writes and present conflict recovery.
- `packages/app/src/i18n/resources.ts`: accurate Knowledge, conflict, validation, and cancellation copy in both locales.
- `packages/app/src/styles/app.css`: scoped Knowledge form/search/status styles using existing tokens.

---

### Task 1: PR #2 API Endpoint Configuration

**Files:**

- Create: `apps/web/src/api-config.ts`
- Test: `apps/web/src/api-config.test.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/create-web-gateways.ts`
- Modify: `apps/web/src/create-web-gateways.test.ts`
- Modify: `apps/web/src/WebConfigurationErrorPage.tsx`
- Modify: `apps/web/src/WebConfigurationErrorPage.test.tsx`
- Modify: `apps/web/src/vite-env.d.ts`
- Modify: `apps/web/.env.example`
- Modify: `docs/web-deployment.md`

**Interfaces:**

- Produces: `resolveApiBaseUrl(env: PublicApiEnvironment): string` and `ApiConfigurationError`.
- Consumes: existing `createHttpClient({ baseUrl })` and existing mixed `AppGateways` composition.

- [ ] **Step 1: Complete the failing endpoint tests**

Keep the already-created `api-config.test.ts` and add explicit conflict/default-port cases:

```ts
expect(resolveApiBaseUrl({ VITE_API_PROTOCOL: 'http', VITE_API_HOSTNAME: 'localhost' })).toBe(
  'http://localhost'
)
expect(() =>
  resolveApiBaseUrl({
    VITE_API_BASE_URL: 'https://api.example.test',
    VITE_API_PORT: '8443'
  })
).toThrowError(ApiConfigurationError)
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node node_modules\vitest\vitest.mjs run apps/web/src/api-config.test.ts --configLoader runner
```

Expected: FAIL because `./api-config` does not exist.

- [ ] **Step 3: Implement the minimal configuration resolver**

Create `api-config.ts` with these exact public shapes and rules:

```ts
export interface PublicApiEnvironment {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_PROTOCOL?: string
  readonly VITE_API_HOSTNAME?: string
  readonly VITE_API_PORT?: string
}

export class ApiConfigurationError extends Error {
  override readonly name = 'ApiConfigurationError'
}

export function resolveApiBaseUrl(env: PublicApiEnvironment): string {
  const baseUrl = env.VITE_API_BASE_URL?.trim()
  const splitValues = [env.VITE_API_PROTOCOL, env.VITE_API_HOSTNAME, env.VITE_API_PORT]
  if (baseUrl && splitValues.some((value) => value !== undefined && value.trim() !== '')) {
    throw new ApiConfigurationError('Use either VITE_API_BASE_URL or split API settings, not both.')
  }
  if (baseUrl) return validateOrigin(baseUrl)

  const protocol = (env.VITE_API_PROTOCOL?.trim() || 'https').replace(/:$/u, '').toLowerCase()
  const hostname = env.VITE_API_HOSTNAME?.trim() || 'api.hmalliances.org'
  const port = env.VITE_API_PORT?.trim()
  if (protocol !== 'http' && protocol !== 'https')
    throw new ApiConfigurationError('Invalid API protocol.')
  if (port !== undefined && (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    throw new ApiConfigurationError('Invalid API port.')
  }
  return validateOrigin(`${protocol}://${hostname}${port ? `:${port}` : ''}`)
}
```

`validateOrigin()` must reject credentials, paths other than `/`, query, fragment, and non-HTTP(S) schemes, and return `url.origin`.

- [ ] **Step 4: Run the endpoint tests and verify GREEN**

Run the Step 2 command. Expected: all `api-config.test.ts` cases PASS.

- [ ] **Step 5: Add failing bootstrap composition tests**

Update `create-web-gateways.test.ts` so endpoint parsing is tested only in `api-config.test.ts`, and add a `WebConfigurationErrorPage` test asserting both configuration forms are named without rendering any supplied value.

```ts
expect(screen.getByText(/VITE_API_BASE_URL/u)).toBeInTheDocument()
expect(screen.getByText(/VITE_API_HOSTNAME/u)).toBeInTheDocument()
```

- [ ] **Step 6: Run bootstrap tests and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run apps/web/src/create-web-gateways.test.ts apps/web/src/WebConfigurationErrorPage.test.tsx --configLoader runner
```

Expected: FAIL because the error page only describes `VITE_API_BASE_URL` and `main.tsx` has not adopted `resolveApiBaseUrl`.

- [ ] **Step 7: Wire the resolver and PR environment declarations**

`main.tsx` must build a plain `PublicApiEnvironment` from narrowed string values, call `resolveApiBaseUrl()`, pass its result to `createWebGateways()`, and catch only `ApiConfigurationError`. `create-web-gateways.ts` must stop parsing environment semantics and only compose Gateways around the already normalized origin.

Declare:

```ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_PROTOCOL?: string
  readonly VITE_API_HOSTNAME?: string
  readonly VITE_API_PORT?: string
}
```

Document the two mutually exclusive examples in `.env.example` and update `docs/web-deployment.md` to state that the default deployment origin is `https://api.hmalliances.org`.

- [ ] **Step 8: Run tests, typecheck, and commit**

```powershell
node node_modules\vitest\vitest.mjs run apps/web/src/api-config.test.ts apps/web/src/create-web-gateways.test.ts apps/web/src/WebConfigurationErrorPage.test.tsx --configLoader runner
node node_modules\typescript\bin\tsc --noEmit --pretty false
git add apps/web docs/web-deployment.md
git commit -m "refactor(web): integrate centralized backend configuration"
```

Expected: tests and typecheck PASS; commit contains no `ApiClient` duplicate.

---

### Task 2: FormData Support in the Existing HTTP Client

**Files:**

- Modify: `packages/app/src/infrastructure/http/http-client.ts`
- Test: `packages/app/src/infrastructure/http/http-client.test.ts`

**Interfaces:**

- Produces: `postForm(path: string, body: FormData, options?: PostFormOptions): Promise<HttpJsonResponse>`.
- Consumes: existing `parseJsonResponse()`, `HttpProblemError`, and `HttpContractError`.

- [ ] **Step 1: Write failing multipart tests**

```ts
it('posts FormData without setting a multipart Content-Type boundary', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ accepted: true }, { status: 202 }))
  const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
  const body = new FormData()
  body.append('file', new File(['hello'], 'notes.md', { type: 'text/markdown' }))

  await client.postForm('/knowledge-sources/uploads', body, {
    idempotencyKey: 'upload_12345678'
  })

  const init = fetchImpl.mock.calls[0]?.[1]
  expect(init?.body).toBe(body)
  expect(init?.headers).toEqual({ 'Idempotency-Key': 'upload_12345678' })
  expect(init?.headers).not.toHaveProperty('Content-Type')
})
```

Add one case proving `AbortSignal` is forwarded and one 413 Problem Details case proving `status`, `code`, and `detail` survive.

- [ ] **Step 2: Run the client test and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/infrastructure/http/http-client.test.ts --configLoader runner
```

Expected: FAIL because `postForm` is absent.

- [ ] **Step 3: Implement minimal `postForm`**

```ts
export interface PostFormOptions {
  readonly idempotencyKey: string
  readonly signal?: AbortSignal
}

async postForm(path, body, options): Promise<HttpJsonResponse> {
  const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
  const response = await fetchImpl(requestUrl.toString(), {
    body,
    headers: { 'Idempotency-Key': options.idempotencyKey },
    method: 'POST',
    ...(options.signal === undefined ? {} : { signal: options.signal })
  })
  return parseJsonResponse(response)
}
```

- [ ] **Step 4: Run client tests and commit**

Run Step 2. Expected: PASS, with existing JSON tests still green.

```powershell
git add packages/app/src/infrastructure/http/http-client.ts packages/app/src/infrastructure/http/http-client.test.ts
git commit -m "feat(frontend): support knowledge multipart requests"
```

---

### Task 3: Knowledge Domain Models and Strict Transport Validation

**Files:**

- Modify: `packages/app/src/domain/models.ts`
- Modify: `packages/app/src/domain/gateways.ts`
- Modify: `packages/app/src/infrastructure/http/transport-types.ts`
- Modify: `packages/app/src/infrastructure/http/validators.ts`
- Test: `packages/app/src/infrastructure/http/validators.test.ts`
- Modify: `packages/app/src/infrastructure/http/mappers.ts`
- Test: `packages/app/src/infrastructure/http/mappers.test.ts`

**Interfaces:**

- Produces: `UiKnowledgeUploadInput`, `UiKnowledgeVersionUploadInput`, `UiKnowledgeIngestionJob`, `UiKnowledgeSearchInput`, `UiKnowledgeSearchResult`, and parsers/mappers for their DTOs.
- Consumes: existing opaque IDs, `UiKnowledgeSource`, and strict validator helper patterns.

- [ ] **Step 1: Add failing validator fixtures**

Use a valid upload response fixture containing `source` plus:

```ts
const ingestionJob = {
  id: 'job_knowledge_12345678',
  job_type: 'knowledge.ingest',
  status: 'queued',
  progress: { current: 0, message: null, percent: 0, total: 1, unit: 'file' },
  created_at: '2026-07-20T00:00:00Z',
  started_at: null,
  finished_at: null,
  expires_at: null,
  error: null,
  request_id: 'request_12345678',
  extensions: {},
  source_id: 'source_knowledge_12345678',
  source_version_id: 'version_knowledge_12345678',
  stats: { documents: 0, chunks: 0, embedded_tokens: 0, skipped: 0 }
}
```

Test valid parsing, missing `source_id`, unknown `status`, extra top-level fields, malformed search wrapper, and missing citation locator.

- [ ] **Step 2: Run validator tests and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/infrastructure/http/validators.test.ts --configLoader runner
```

Expected: FAIL because the new parsers do not exist.

- [ ] **Step 3: Define exact domain inputs and outputs**

Add these stable intent shapes:

```ts
export interface UiKnowledgeUploadInput {
  readonly file: File
  readonly name?: string
  readonly signal?: AbortSignal
}
export interface UiKnowledgeVersionUploadInput {
  readonly sourceId: UiKnowledgeSourceId
  readonly file: File
  readonly signal?: AbortSignal
}
export type UiKnowledgeJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
export interface UiKnowledgeIngestionJob {
  readonly id: UiOpaqueId<'knowledge-ingestion-job'>
  readonly sourceId: UiKnowledgeSourceId
  readonly status: UiKnowledgeJobStatus
  readonly progressPercent: number | null
  readonly errorCode: string | null
  readonly errorDetail: string | null
}
export interface UiKnowledgeUploadResult {
  readonly source: UiKnowledgeSource
  readonly ingestionJob: UiKnowledgeIngestionJob
}
export interface UiKnowledgeSearchInput {
  readonly query: string
  readonly sourceIds: readonly UiKnowledgeSourceId[]
  readonly signal?: AbortSignal
}
export interface UiKnowledgeSearchResult {
  readonly id: string
  readonly sourceId: UiKnowledgeSourceId
  readonly title: string
  readonly locatorLabel: string
  readonly quote: string | null
  readonly score: number
}
```

Extend `KnowledgeGateway` with `uploadKnowledgeSource`, `uploadKnowledgeSourceVersion`, `getKnowledgeIngestionJob`, and `searchKnowledge` using those types.

- [ ] **Step 4: Implement strict DTO parsers and mappers**

Define transport types with backend `snake_case`. Parsers must reject extra fields where the formal schema uses `additionalProperties: false`, accept extension/metadata bags only at explicitly open locations, and preserve `ProblemDetails` inside failed jobs. Map locators in this order: PDF page, heading symbol, line range, path, then source title.

- [ ] **Step 5: Run validator/mapper tests and typecheck**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/infrastructure/http/validators.test.ts packages/app/src/infrastructure/http/mappers.test.ts --configLoader runner
node node_modules\typescript\bin\tsc --noEmit --pretty false
```

Expected: PASS after mock and HTTP Gateway compile stubs are added only when required by TypeScript.

- [ ] **Step 6: Commit the model boundary**

```powershell
git add packages/app/src/domain packages/app/src/infrastructure/http/transport-types.ts packages/app/src/infrastructure/http/validators.ts packages/app/src/infrastructure/http/validators.test.ts packages/app/src/infrastructure/http/mappers.ts packages/app/src/infrastructure/http/mappers.test.ts
git commit -m "feat(frontend): define knowledge ingestion contracts"
```

---

### Task 4: Knowledge HTTP and Mock Gateways

**Files:**

- Modify: `packages/app/src/infrastructure/http/http-knowledge-gateway.ts`
- Test: `packages/app/src/infrastructure/http/http-gateways.test.ts`
- Modify: `packages/app/src/infrastructure/mock/mock-gateways.ts`
- Test: `packages/app/src/infrastructure/mock/mock-gateways.test.ts`

**Interfaces:**

- Consumes: Task 2 `postForm()` and Task 3 domain/parsers/mappers.
- Produces: complete `KnowledgeGateway` implementations for Web and Mock/Electron.

- [ ] **Step 1: Write failing upload/version endpoint tests**

Assert:

```ts
expect(fetchUrl(fetchImpl, 0)).toBe('http://127.0.0.1:8000/api/v1/knowledge-sources/uploads')
expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
expect(
  (fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']
).toMatch(/^knowledge_upload_/u)
expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData)
```

For version upload, assert the encoded real source ID path and no `name` field. Assert both return a mapped 202 `UiKnowledgeUploadResult`.

- [ ] **Step 2: Write failing job and search tests**

Assert job GET uses `/knowledge-ingestion-jobs/{job_id}` with the supplied signal. Assert search POST body equals:

```ts
{
  query: 'vector database',
  selection: {
    mode: 'explicit',
    include_source_ids: ['source_knowledge_12345678'],
    exclude_source_ids: [],
    agent_scope: 'general_chat'
  },
  top_k: 20,
  include_quotes: true
}
```

- [ ] **Step 3: Run Gateway tests and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/infrastructure/http/http-gateways.test.ts --configLoader runner
```

Expected: FAIL because the methods are missing.

- [ ] **Step 4: Implement the HTTP methods**

Each upload action creates one key using the existing opaque ID helper pattern, appends the exact backend form fields, calls `postForm`, checks status `202`, validates, and maps. Search uses `postJson` and validates the current temporary `{ items: [...] }` wrapper only inside the adapter.

- [ ] **Step 5: Add failing Mock Gateway tests**

Test that upload returns a queued job, repeated `getKnowledgeIngestionJob()` reaches `succeeded`, version upload preserves the source ID, and search returns deterministic source-linked results. Cancellation must reject with the platform `AbortError` shape.

- [ ] **Step 6: Implement minimal Mock behavior and run tests**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/infrastructure/http/http-gateways.test.ts packages/app/src/infrastructure/mock/mock-gateways.test.ts --configLoader runner
node node_modules\typescript\bin\tsc --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 7: Commit Gateways**

```powershell
git add packages/app/src/infrastructure/http/http-knowledge-gateway.ts packages/app/src/infrastructure/http/http-gateways.test.ts packages/app/src/infrastructure/mock/mock-gateways.ts packages/app/src/infrastructure/mock/mock-gateways.test.ts
git commit -m "feat(frontend): connect knowledge ingestion endpoints"
```

---

### Task 5: Bounded Ingestion Polling and Error Copy

**Files:**

- Create: `packages/app/src/features/knowledge/knowledge-polling.ts`
- Test: `packages/app/src/features/knowledge/knowledge-polling.test.ts`
- Create: `packages/app/src/features/knowledge/knowledge-errors.ts`

**Interfaces:**

- Produces: `pollKnowledgeIngestion(options): Promise<UiKnowledgeIngestionJob>` and `getKnowledgeErrorMessage(error, t): string`.
- Consumes: `KnowledgeGateway.getKnowledgeIngestionJob()` and `HttpProblemError`.

- [ ] **Step 1: Write failing polling tests**

Use injected `wait(ms, signal)` so tests do not sleep. Cover queued→running→succeeded, failed terminal return, `maxAttempts` timeout, and abort before the next request.

```ts
await expect(
  pollKnowledgeIngestion({
    gateway,
    jobId,
    signal: controller.signal,
    maxAttempts: 3,
    wait: async () => undefined
  })
).resolves.toMatchObject({ status: 'succeeded' })
```

- [ ] **Step 2: Run polling tests and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/features/knowledge/knowledge-polling.test.ts --configLoader runner
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement bounded polling**

Default to 30 attempts and 1,500 ms. Return on `succeeded`, `failed`, `cancelled`, or `expired`. Throw a named `KnowledgePollingTimeoutError` at the bound. The default wait must remove its abort listener after resolve/reject.

- [ ] **Step 4: Implement structured error mapping**

Map `knowledge.file_too_large`, `knowledge.file_type_unsupported`, `knowledge.file_type_mismatch`, `idempotency.*`, 409, 412, 413, 422, `KnowledgePollingTimeoutError`, `AbortError`, and generic network/contract failures to i18n keys. Never interpolate `requestId`, URL, filename, response body, or free text.

- [ ] **Step 5: Run tests and commit**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/features/knowledge/knowledge-polling.test.ts --configLoader runner
git add packages/app/src/features/knowledge/knowledge-polling.ts packages/app/src/features/knowledge/knowledge-polling.test.ts packages/app/src/features/knowledge/knowledge-errors.ts
git commit -m "feat(frontend): bound knowledge ingestion polling"
```

---

### Task 6: Knowledge Page Upload, Version, Search, and Cleanup

**Files:**

- Modify: `packages/app/src/features/knowledge/KnowledgePage.tsx`
- Test: `packages/app/src/app/WorkspaceApp.test.tsx`
- Modify: `packages/app/src/i18n/resources.ts`
- Modify: `packages/app/src/styles/app.css`

**Interfaces:**

- Consumes: Tasks 3–5 Knowledge domain methods, polling, and error mapping.
- Produces: accessible Gateway-driven Knowledge workflows with no Mock transport leakage.

- [ ] **Step 1: Write failing file-validation and duplicate-submit tests**

Render with an injected controllable `KnowledgeGateway`. Assert `.exe` and files over `10 * 1024 * 1024` are rejected before Gateway invocation. Start a valid upload whose promise remains pending, click submit twice, and assert one call plus a disabled submit button.

- [ ] **Step 2: Write failing polling/unmount and real-source-ID tests**

Assert an accepted upload displays “正在摄取”, unmount aborts the captured signal, and the policy link uses the selected source ID:

```ts
expect(screen.getByRole('link', { name: '查看当前来源的授权矩阵' })).toHaveAttribute(
  'href',
  `/knowledge/${source.id}/visibility`
)
```

- [ ] **Step 3: Write failing version and search tests**

Select an existing file source, upload a replacement, and assert `uploadKnowledgeSourceVersion({ sourceId, file, signal })`. Search must cover loading, empty, result title/locator/quote, and error states.

- [ ] **Step 4: Run page tests and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/app/WorkspaceApp.test.tsx --configLoader runner
```

Expected: new cases FAIL because `MockSourceForm`, local refresh, and local filter do not implement these flows.

- [ ] **Step 5: Replace `MockSourceForm` with a Gateway-driven file form**

Use native `<input type="file" accept=".txt,.md,.markdown,.pdf,.docx">`, an optional name input for new sources, the existing button/control vocabulary, `aria-live="polite"` for status, and no inline transport details. Preserve existing source list/detail layout.

- [ ] **Step 6: Add bounded lifecycle state**

Keep one `AbortController` per upload/search action in refs. Abort on user cancel, new replacement action, and component unmount. After terminal success, reload sources through the existing resource loader and select the returned source. Prevent any state update after abort/unmount.

- [ ] **Step 7: Add search and source-version interactions**

Use a separate semantic search input from the local source filter, or replace the local filter with clearly labeled tabs/fields so users cannot confuse filtering with backend retrieval. Search results display source title + safe locator + quote; do not expose backend filesystem paths beyond the contract `locator.path` label.

- [ ] **Step 8: Update copy and scoped styles**

Add Chinese and English keys for validation, uploading, ingesting, succeeded, failed, cancelled, retry, version upload, search empty/error, and structured HTTP errors. Remove user-visible “保存到 Mock 状态”, “Mock 操作”, and fake sync copy. Add only scoped `.aw-knowledge-*` rules using current tokens, 12–14px radii, existing focus ring, restrained semantic colors, and responsive stacking.

- [ ] **Step 9: Run page tests, typecheck, lint, and commit**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/app/WorkspaceApp.test.tsx packages/app/src/features/knowledge/knowledge-polling.test.ts --configLoader runner
node node_modules\typescript\bin\tsc --noEmit --pretty false
node node_modules\eslint\bin\eslint.js packages/app/src/features/knowledge packages/app/src/app/WorkspaceApp.test.tsx packages/app/src/i18n/resources.ts
git add packages/app/src/features/knowledge packages/app/src/app/WorkspaceApp.test.tsx packages/app/src/i18n/resources.ts packages/app/src/styles/app.css
git commit -m "feat(frontend): add knowledge upload and search workflows"
```

---

### Task 7: Resume 409/412 Authoritative Reload

**Files:**

- Modify: `packages/app/src/features/resume/ResumeEditorPage.tsx`
- Modify: `packages/app/src/features/resume/ResumeWorkspace.tsx`
- Modify: `packages/app/src/app/WorkspaceApp.test.tsx`
- Modify: `packages/app/src/i18n/resources.ts`

**Interfaces:**

- Consumes: existing `HttpProblemError`, `ResumeGateway.getResumeEditor()`, Proposal and Render flows.
- Produces: a stale-write lock and explicit authoritative reload action.

- [ ] **Step 1: Write a failing 412 recovery test**

Inject a Resume Gateway whose first mutation rejects with:

```ts
new HttpProblemError({
  code: 'resume.precondition_failed',
  detail: 'The Resume ETag is stale.',
  requestId: null,
  status: 412,
  title: 'Resume changed elsewhere'
})
```

Assert the page shows a conflict alert, subsequent write controls are disabled, “重新加载服务器版本” calls `getResumeEditor()`, and the returned revision replaces the displayed revision.

- [ ] **Step 2: Add a failing 409 test**

Assert a 409 conflict uses the same recovery boundary without silently replaying or incrementing revision.

- [ ] **Step 3: Run targeted tests and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/app/WorkspaceApp.test.tsx --configLoader runner
```

Expected: new conflict cases FAIL because mutations currently surface generic errors only.

- [ ] **Step 4: Implement conflict state and reload**

Add a discriminated conflict state containing only `status: 409 | 412`. On mutation failure, set it when `error instanceof HttpProblemError` and status matches. Block editor writes, Proposal decisions, and template changes while stale. Reload through `ResumeEditorPage`'s existing loader/Gateway, replace editor/Proposal/artifact projections with authority, then clear conflict. Do not auto-replay edits.

- [ ] **Step 5: Run tests and commit**

```powershell
node node_modules\vitest\vitest.mjs run packages/app/src/app/WorkspaceApp.test.tsx packages/app/src/infrastructure/http/http-gateways.test.ts --configLoader runner
node node_modules\typescript\bin\tsc --noEmit --pretty false
git add packages/app/src/features/resume packages/app/src/app/WorkspaceApp.test.tsx packages/app/src/i18n/resources.ts
git commit -m "fix(frontend): recover from stale resume revisions"
```

---

### Task 8: Pending Contracts, Full Gates, and PR Coverage Review

**Files:**

- Modify: `packages/app/src/domain/pending.ts`
- Modify if evidence requires: `docs/contract-open-questions.md`
- Verify only: `workspace-shared-docs/contracts/v1/ai-job-workspace.contract.schema.json`
- Verify only: `workspace-shared-docs/contracts/v1/ai-job-workspace-api-contract.md`

**Interfaces:**

- Consumes: all previous tasks.
- Produces: accurate pending markers and evidence-backed delivery status.

- [ ] **Step 1: Update pending entries without closing unverified contracts**

Record that direct multipart upload/version and the search response wrapper remain temporary path-level bindings; list the replacement condition as frozen UploadSession/response contracts plus shared-environment smoke. Keep Knowledge visibility write, delete/sync, production identity, and long-term replay pending.

- [ ] **Step 2: Verify no prohibited leakage**

```powershell
rg -n "ks_mock_git|X-Mock-|X-AIWS-|fetch\(" packages/app/src/features apps/web/src
rg -n "ApiClient|api-client" apps packages
git diff --check
```

Expected: no hardcoded Mock source ID in product Knowledge UI, no identity headers, no page `fetch`, and no second `ApiClient` implementation. Mock fixtures/tests may still contain Mock IDs.

- [ ] **Step 3: Verify contract copies remain identical**

```powershell
Get-FileHash contract\ai-job-workspace.contract.schema.json
Get-FileHash ..\workspace-back\contract\ai-job-workspace.contract.schema.json
Get-FileHash contract\ai-job-workspace-api-contract.md
Get-FileHash ..\workspace-back\contract\ai-job-workspace-api-contract.md
```

Expected: matching SHA-256 pairs; do not modify the backend copy.

- [ ] **Step 4: Run complete frontend gates**

```powershell
node node_modules\prettier\bin\prettier.cjs --check .
node node_modules\eslint\bin\eslint.js . --max-warnings 0
node node_modules\typescript\bin\tsc --noEmit --pretty false
node node_modules\vitest\vitest.mjs run --configLoader runner
$env:VITE_API_BASE_URL='http://127.0.0.1:8000'
node node_modules\vite\bin\vite.js build --configLoader runner
Remove-Item Env:\VITE_API_BASE_URL
```

Expected: formatting, lint, typecheck, target tests, and Web build pass. If the known three Windows Electron custom-protocol assertions still fail, record their exact names and confirm no additional failures.

- [ ] **Step 5: Review PR #2 content coverage**

Compare `HEAD` with `upstream/pr-2` for `apps/web`, `apps/desktop/src/renderer/src/main.tsx`, `docs/web-deployment.md`, and HTTP infrastructure. Confirm every non-duplicated PR intent is either integrated or deliberately superseded by the existing stronger implementation. Do not overwrite Electron Mock composition merely to match the PR tree.

- [ ] **Step 6: Commit documentation and final cleanup**

```powershell
git add packages/app/src/domain/pending.ts docs/contract-open-questions.md
git commit -m "docs(frontend): record remaining integration contracts"
git status --short --branch
```

Expected: clean working tree, no temporary files created, and `workspace-back/` unchanged.

---

## Final Delivery Evidence

The final report must state:

1. Which existing Gateway, UI components, tokens, mocks, and HTTP helpers were reused.
2. Which stable Knowledge domain methods were added.
3. The exact method/path/header/body/status/error bindings confirmed from the backend.
4. How FormData, idempotency, cancellation, bounded polling, page unmount, and Resume 409/412 recovery work.
5. Which Workspace, Interview, visibility-write, upload, and search-wrapper parts remain Mock or pending.
6. Every command run, its result, known baseline failures, and anything not verified.
7. That `workspace-back/` was not modified and shared-environment end-to-end smoke was not performed.
