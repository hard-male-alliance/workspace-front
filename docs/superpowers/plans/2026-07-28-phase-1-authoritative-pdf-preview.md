# Phase 1 Authoritative PDF Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the Resume editor displays only validated backend-generated PDFs and keeps the last real PDF visible and correctly marked across manual Resume revisions.

**Architecture:** Preserve the existing React page → Resume Gateway/Render Process → API v2 → FastAPI Render Job boundary. Decouple the displayed PDF lease from the request generation so revision changes cancel stale work without destroying the last validated PDF. Remove the semantic HTML fallback and atomically bind Artifact authority to its validated Blob URL lease.

**Tech Stack:** React 19, TypeScript 6, Vitest/Testing Library, API v2 Gateways, FastAPI Render Jobs, PostgreSQL, XeLaTeX, Poppler.

## Global Constraints

- Work only on phase 1; do not modify Proposal continuation, 412 recovery, or interview realtime behavior.
- The right pane must never present `ResumeSemanticPreview` as a PDF.
- Manual Resume edits must not auto-start Render Jobs.
- A displayed stale PDF must remain visibly marked as stale until explicit regeneration succeeds.
- Do not weaken Artifact subject, media type, length, EOF, or SHA-256 validation.
- Do not add a Mock or renderer fallback.
- Temporary validation outputs belong under the project root `.tmp/`.

---

### Task 1: Lock the real regression into the Resume Artifact DOM seam

**Files:**

- Modify: `packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx`

**Interfaces:**

- Consumes: `WorkspaceApp`, `InMemoryResumeGateway`, `InMemoryWorkspaceOperationsGateway`, and the production `ResumePreviewPanel`.
- Produces: regression tests for empty, stale, replacement, failure, and unmount PDF states.

- [ ] **Step 1: Import `waitFor` and add a reusable Blob URL host that returns a new URL for every validated PDF**

Update the Testing Library import:

```ts
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
```

Replace the fixed return value in `installBlobUrlHost` with an optional sequence:

```ts
function installBlobUrlHost(urls: readonly string[] = ['blob:resume-pdf-preview']): {
  readonly createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>
  readonly revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>
} {
  let index = 0
  const createObjectURL = vi.fn<(blob: Blob) => string>().mockImplementation(() => {
    const url = urls[Math.min(index, urls.length - 1)]
    index += 1
    if (url === undefined) throw new Error('Expected a configured Blob URL.')
    return url
  })
  const revokeObjectURL = vi.fn<(url: string) => void>()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  return { createObjectURL, revokeObjectURL }
}
```

- [ ] **Step 2: Add a failing empty-state test**

```ts
it('shows no semantic Resume when no real PDF has been generated', async (): Promise<void> => {
  render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
  await screen.findByRole('heading', { name: 'Klee Chen' })

  expect(screen.queryByRole('region', { name: '语义内容预览' })).not.toBeInTheDocument()
  expect(screen.queryByText('这是语义内容预览，不是最终模板排版。')).not.toBeInTheDocument()
  expect(screen.getByText('尚未生成 PDF 预览。')).toBeInTheDocument()
})
```

- [ ] **Step 3: Add a failing persistence and explicit-regeneration test**

The test must:

1. generate `blob:resume-pdf-revision-18`;
2. change and save the section content through the actual Resume editor;
3. assert that no second Render command was issued;
4. assert the iframe still points to revision 18;
5. assert the stale-PDF message is visible;
6. explicitly generate revision 19;
7. assert the iframe atomically changes to `blob:resume-pdf-revision-19`;
8. assert revision 18 is revoked only after revision 19 is ready.

Use this assertion shape:

```ts
expect(screen.getByTitle('简历 PDF 预览')).toHaveAttribute('src', 'blob:resume-pdf-revision-18')
expect(
  screen.getByText('当前 PDF 基于较早的简历版本生成。请手动生成新的 PDF 以查看最新改动。')
).toBeInTheDocument()
expect(startRender).toHaveBeenCalledTimes(1)

fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
await waitFor(() =>
  expect(screen.getByTitle('简历 PDF 预览')).toHaveAttribute('src', 'blob:resume-pdf-revision-19')
)
expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith('blob:resume-pdf-revision-18')
```

- [ ] **Step 4: Add a failing replacement-failure test**

Configure the second Artifact stream to fail. Assert that revision 18 remains displayed, is marked stale, and is not revoked.

```ts
expect(await screen.findByRole('alert')).toHaveTextContent('无法生成 PDF 预览')
expect(screen.getByTitle('简历 PDF 预览')).toHaveAttribute('src', 'blob:resume-pdf-revision-18')
expect(objectUrls.revokeObjectURL).not.toHaveBeenCalledWith('blob:resume-pdf-revision-18')
```

- [ ] **Step 5: Run the focused test and verify RED**

Run:

```bash
corepack pnpm vitest run --project dom packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
```

Expected failures:

- semantic preview is still present before the first PDF;
- revision change removes the existing iframe;
- old Blob URL is revoked during generation cleanup.

- [ ] **Step 6: Commit the failing regression tests**

```bash
git add packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
git commit -m "test: reproduce stale Resume PDF preview replacement"
```

---

### Task 2: Keep a validated PDF lease across Resume generations

**Files:**

- Modify: `packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx`
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `packages/app/src/i18n/resources.ts`

**Interfaces:**

- Consumes: `UiWorkspaceArtifact`, `ResumePdfPreviewLease`, `generation`, and the current `UiResumeEditorModel`.
- Produces: `DisplayedResumePdf`, a persistent real-PDF-only state, and stale/current presentation.

- [ ] **Step 1: Bind Artifact authority and lease atomically**

Add:

```ts
interface DisplayedResumePdf {
  readonly artifact: UiWorkspaceArtifact
  readonly lease: ResumePdfPreviewLease
}
```

Replace separate `artifact` and `previewLease` state with:

```ts
const [displayedPdf, setDisplayedPdf] = useState<DisplayedResumePdf | null>(null)
const displayedPdfRef = useRef<DisplayedResumePdf | null>(null)
```

Implement:

```ts
const commitDisplayedPdf = (
  artifactToDisplay: UiWorkspaceArtifact,
  lease: ResumePdfPreviewLease
): void => {
  if (displayedPdfRef.current?.lease !== lease) displayedPdfRef.current?.lease.dispose()
  const displayed = { artifact: artifactToDisplay, lease }
  displayedPdfRef.current = displayed
  setDisplayedPdf(displayed)
  setArtifactExpired(false)
  setInlinePreviewStatus(supportsInlinePdfPreview() ? 'loading' : 'unavailable')
}
```

Do not set Artifact state before the PDF stream and lease pass validation.

- [ ] **Step 2: Separate generation cleanup from component unmount cleanup**

The generation effect must cancel stale work and clear request-local state without disposing `displayedPdfRef.current`.

```ts
useEffect((): void => {
  const previousGeneration = activeGenerationRef.current
  activeGenerationRef.current = generation
  if (previousGeneration === null || previousGeneration === generation) return

  renderAbortRef.current?.abort()
  auxiliaryAbortRef.current?.abort()
  cancelAbortRef.current?.abort()
  saveAbortRef.current?.abort()
  jobAuthorityRef.current = null
  setJobAuthority(null)
  setError(null)
  setPreviewProgress(null)
  setRecoveryCandidates([])
  setRecoverySearched(false)
}, [generation])
```

Keep lease disposal only in an unmount-only effect:

```ts
useEffect(
  (): (() => void) => (): void => {
    activeGenerationRef.current = null
    renderAbortRef.current?.abort()
    auxiliaryAbortRef.current?.abort()
    cancelAbortRef.current?.abort()
    saveAbortRef.current?.abort()
    displayedPdfRef.current?.lease.dispose()
    displayedPdfRef.current = null
  },
  []
)
```

- [ ] **Step 3: Commit a new PDF only after validation**

After `createResumePdfPreviewLease` succeeds, call:

```ts
commitDisplayedPdf(artifactToPreview, lease)
```

If generation changed or the controller aborted, dispose only the new uncommitted lease.

- [ ] **Step 4: Remove the semantic fallback**

Delete the `ResumeSemanticPreview` import and render branch. When `displayedPdf === null`, render a PDF empty state:

```tsx
<p className="aw-muted-copy">
  {t('resume.workspace.pdfNotGenerated', { defaultValue: '尚未生成 PDF 预览。' })}
</p>
```

When the browser has no native viewer, keep only the real Artifact download/save fallback.

- [ ] **Step 5: Mark a displayed PDF stale from its exact Artifact subject**

Compute:

```ts
const isDisplayedPdfStale =
  displayedPdf !== null &&
  (displayedPdf.artifact.subject.resourceType !== 'resume' ||
    displayedPdf.artifact.subject.id !== editor.resume.id ||
    displayedPdf.artifact.subject.revision !== editor.resume.revision)
```

Keep displaying its iframe while presenting `resume.workspace.pdfOutdated`.

- [ ] **Step 6: Stop remounting the preview by generation**

In `ResumeWorkspace.tsx`, remove:

```tsx
key = { previewGeneration }
```

Continue passing `generation={previewGeneration}` so stale asynchronous results are rejected.

- [ ] **Step 7: Add the empty-state translation**

Add `resume.workspace.pdfNotGenerated` consistently to the maintained locale resources with the Chinese and English values used by tests.

- [ ] **Step 8: Run the focused test and verify GREEN**

Run:

```bash
corepack pnpm vitest run --project dom packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
```

Expected: all tests pass, including persistence, explicit replacement, failure retention, and unmount revocation.

- [ ] **Step 9: Run adjacent Resume tests and static checks**

Run:

```bash
corepack pnpm vitest run --project dom \
  packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx \
  packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build:web
```

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 10: Commit the minimal production fix**

```bash
git add \
  packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx \
  packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx \
  packages/app/src/i18n/resources.ts
git commit -m "fix: keep Resume preview on the last real PDF"
```

---

### Task 3: Verify the real XeLaTeX and browser path

**Files:**

- Create temporary validation outputs only under: `../.tmp/phase-1-pdf-validation/`
- Do not modify backend production code.

**Interfaces:**

- Consumes: the running Web app, API proxy, FastAPI backend, PostgreSQL, Render Job, Artifact stream, XeLaTeX, and Poppler.
- Produces: browser evidence and deterministic page/text/raster comparisons for the same revision/template.

- [ ] **Step 1: Restart the current main services**

Start the backend with the private WSL config, the local 9000 proxy, and Vite 5173. Confirm:

```text
GET http://127.0.0.1:8000/_internal/healthz -> 200
GET http://127.0.0.1:9000/_internal/healthz -> 200
GET http://127.0.0.1:5173/ -> 200
```

- [ ] **Step 2: Reproduce the user flow in the real browser**

Generate a PDF, save one manual section edit, and confirm:

- the same iframe remains visible;
- the stale message appears;
- no Render Job starts until the user clicks the button;
- explicit regeneration replaces the iframe.

- [ ] **Step 3: Capture exact Artifact authority**

For each generated PDF, record only non-sensitive metadata:

```json
{
  "resume_id": "resume_...",
  "resume_revision": 19,
  "template_id": "tpl_...",
  "template_version": "1.0.0",
  "artifact_id": "artifact_...",
  "media_type": "application/pdf",
  "size_bytes": 12345
}
```

Do not record tokens, prompts, user contact data, or signed URLs.

- [ ] **Step 4: Compare two real PDFs for the same revision/template**

Save the two authenticated PDF streams under `.tmp/phase-1-pdf-validation/`, then run Poppler:

```bash
pdfinfo first.pdf
pdfinfo second.pdf
pdftotext first.pdf first.txt
pdftotext second.pdf second.txt
pdftoppm -png -r 144 first.pdf first
pdftoppm -png -r 144 second.pdf second
diff -u first.txt second.txt
sha256sum first-*.png second-*.png
```

Expected:

- identical page count;
- no text diff;
- corresponding page PNG hashes are identical;
- raw PDF hashes may differ only if non-visual metadata differs.

- [ ] **Step 5: Verify the renderer is real**

Confirm the active config uses `adapter: "xelatex"` and the backend invokes `/usr/bin/xelatex`. A Mock or semantic fallback is a hard failure.

- [ ] **Step 6: Inspect console and network**

Expected:

- no failed Render/Artifact requests;
- no stale Blob URL loaded after replacement;
- no semantic preview element;
- no automatic Render request from the manual edit alone.

- [ ] **Step 7: Run final front-end gates**

Run:

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Expected: all commands exit 0. If a pre-existing unrelated failure occurs, report its exact command and scope without declaring the gate passed.

- [ ] **Step 8: Commit validation documentation only if durable evidence is needed**

Do not commit PDFs, screenshots, tokens, logs, or `.tmp` outputs. The phase is complete when the real browser flow and automated regression pass.
