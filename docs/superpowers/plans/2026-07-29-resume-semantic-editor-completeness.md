# Resume Semantic Editor Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-authored semantic text value consumed by the Resume PDF renderer visible and directly editable in the center pane.

**Architecture:** Extend the existing typed Resume Gateway with narrow profile/contact mutations and a discriminated item-field mutation. The center pane continues to edit the authoritative `UiResumeDocument`; API V2 adapters translate camelCase UI fields into existing `set_field` operations, and the current revision/idempotency/recovery state machine remains in control.

**Tech Stack:** React 19, TypeScript 6, Vitest, Testing Library, existing API V2 Resume operation batch.

## Global Constraints

- Preserve the authoritative real-PDF preview strategy and real XeLaTeX renderer.
- Reuse the existing Resume models, Gateway, operation batch, concurrency token, command ID, recovery barrier, inputs and styles.
- Do not parse PDF text, add Mock success behavior, weaken validation, or auto-claim that a stale PDF is current.
- Use TDD and run only one to three targeted tests plus the necessary focused typecheck.
- Do not modify the backend unless an existing `set_field` path is proven insufficient.

---

### Task 1: Typed semantic-field mutations

**Files:**
- Modify: `packages/app/src/contexts/resume/domain/models.ts`
- Modify: `packages/app/src/contexts/resume/application/gateway.ts`
- Modify: `packages/app/src/contexts/resume/infrastructure/memory/gateway.ts`
- Modify: `packages/product-runtime/src/api-v2-gateways.ts`
- Test: `packages/product-runtime/src/index.node.test.ts`

**Interfaces:**
- Consumes: `UiResumeDateRange`, `UiResumeRichText`, `UiResumeItemId`, `UiResumeContactId`, and `UiResumeSectionMutationInput`.
- Produces: discriminated `UiResumeItemUpdateInput`, `UiResumeProfileUpdateInput`, `UiResumeContactUpdateInput`, plus `ResumeGateway.updateResumeProfile()` and `ResumeGateway.updateResumeContact()`.

- [ ] **Step 1: Write failing runtime tests**

Add tests that call the API V2 gateway with:

```ts
{
  field: 'highlights',
  itemId,
  value: [{ marks: [], text: '使用 React 开发平台。' }],
  ...authority
}
```

and assert the operation is:

```ts
expect(operation).toMatchObject({
  entity_id: itemId,
  field_path: ['highlights'],
  op: 'set_field',
  value: [{ marks: [], text: '使用 React 开发平台。' }]
})
```

Add equivalent assertions for `dateRange -> date_range`, profile `fullName -> ['profile', 'full_name']`, and contact `value -> ['value']`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run --project node packages/product-runtime/src/index.node.test.ts -t "maps editable Resume semantic fields"
```

Expected: compilation or assertion failure because the new field and Gateway methods do not exist.

- [ ] **Step 3: Add discriminated domain inputs**

Define item patches equivalent to:

```ts
type UiResumeItemFieldPatch =
  | { readonly field: 'dateRange'; readonly value: UiResumeDateRange | null }
  | { readonly field: 'highlights'; readonly value: readonly UiResumeRichText[] }
  | { readonly field: 'location' | 'organization' | 'subtitle' | 'title' | 'url'; readonly value: string | null }
  | { readonly field: 'skills'; readonly value: readonly string[] }
  | { readonly field: 'summary'; readonly value: UiResumeRichText | null }
```

Intersect it with the existing mutation authority and `itemId`. Add similarly narrow profile and contact unions; do not use `any` or an unbounded JSON value.

- [ ] **Step 4: Implement existing-operation adapters**

Map UI field names to wire paths and encode rich text using existing helpers:

```ts
const wireField = input.field === 'dateRange' ? 'date_range' : input.field
```

Generate root profile operations against `input.resumeId`, contact operations against `input.contactId`, and item operations against `input.itemId`. Compare post-write authority structurally, not with reference equality for arrays or objects.

- [ ] **Step 5: Implement InMemory parity**

Update the current in-memory aggregate immutably for item, profile and contact fields while retaining `runIdempotentResumeCommand`.

- [ ] **Step 6: Run tests and focused typecheck**

Run the targeted node test and:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.renderer.json --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/app/src/contexts/resume packages/product-runtime/src/api-v2-gateways.ts packages/product-runtime/src/index.node.test.ts
git commit -m "feat(resume): support editable semantic fields"
```

### Task 2: Complete structured-item editor

**Files:**
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `packages/app/src/styles/resume/workspace.css`
- Test: `packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 `UiResumeItemUpdateInput` and unchanged `ResumeGateway.updateResumeItem()`.
- Produces: center-pane controls for `dateRange`, `summary`, `highlights`, `skills`, and `url`.

- [ ] **Step 1: Write the failing DOM reproduction**

Change the existing structured-item fixture to contain:

```ts
dateRange: { start: asUiResumePartialDate('2025-03'), end: asUiResumePartialDate('2025-08') },
summary: { marks: [], text: '参与企业内部项目管理平台开发。' },
highlights: [
  { marks: [], text: '使用 React、TypeScript 和 Vite 参与开发。' },
  { marks: [], text: '负责项目列表、任务筛选和成员权限模块。' }
],
skills: ['React', 'TypeScript'],
url: 'https://example.com/project'
```

Assert all values are visible in named inputs/textareas and that editing the first highlight calls `updateResumeItem` with the complete `highlights` array.

- [ ] **Step 2: Run the DOM test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run --project dom packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx -t "shows and edits all PDF-backed structured item text"
```

Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Generalize the existing draft/save helper**

Keep browser drafts as strings, but let the save helper accept a fully typed field value and the set of draft keys it confirms:

```ts
persistItemValue(item.id, 'highlights', nextHighlights, item.highlights, [draftKey])
```

Retain current command ID, revision, concurrency token, `runMutation`, unknown-outcome confirmation and draft cleanup.

- [ ] **Step 4: Render the missing controls**

Use existing `aw-text-input`, `aw-section-textarea`, `aw-rich-text-shell`, and `replaceUiResumeRichTextText`.

- Date: start input, end input and “至今” checkbox.
- Summary: one textarea.
- Highlights: one textarea per highlight, plus focused add/remove buttons.
- Skills: one-item-per-line textarea.
- URL: one URL input.

Changing an existing highlight rebases its marks with `replaceUiResumeRichTextText`; new highlights start with empty marks.

- [ ] **Step 5: Preserve PDF authority**

Do not trigger or fabricate a render. The returned Resume revision updates the editor; the existing preview state detects that the current PDF belongs to an older revision and continues to require “生成新的 PDF 预览”.

- [ ] **Step 6: Run the targeted DOM test**

Expected: PASS, including exact Gateway payload and retained non-edited highlight values.

- [ ] **Step 7: Commit**

```powershell
git add packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx packages/app/src/styles/resume/workspace.css packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx
git commit -m "feat(resume): show PDF-backed item text in editor"
```

### Task 3: Profile and contact editor completion

**Files:**
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `packages/app/src/styles/resume/workspace.css`
- Test: `packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 `updateResumeProfile()` and `updateResumeContact()`.
- Produces: center-pane controls for existing profile and contact text.

- [ ] **Step 1: Write failing profile/contact DOM test**

Provide a profile with name, headline, summary and an existing contact. Assert all values are visible, then edit the headline and contact value and assert the narrow Gateway methods receive exact authority and values.

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run --project dom packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx -t "shows and edits PDF-backed profile text"
```

Expected: FAIL because profile controls are absent.

- [ ] **Step 3: Add the profile card**

Insert a focused profile editor before `aw-resume-sections`. Reuse the same draft-key and save-state pattern as item fields. Only existing contacts are edited; no add/delete/reorder controls are introduced.

- [ ] **Step 4: Rename ambiguous section copy**

Change the visible label from “语义内容” to “板块补充说明（可选）” while retaining the same `section.content` field and save path.

- [ ] **Step 5: Run targeted DOM tests and typecheck**

Run the two new DOM tests and renderer typecheck. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx packages/app/src/styles/resume/workspace.css packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx
git commit -m "feat(resume): expose profile text in center editor"
```

### Task 4: Focused regression verification

**Files:**
- No production changes expected.

- [ ] **Step 1: Run the three targeted tests**

Run the Task 1 runtime test and the two Task 2/3 DOM tests. Expected: PASS.

- [ ] **Step 2: Run renderer typecheck**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.renderer.json --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 3: Inspect scope**

Run:

```powershell
git status --short
git diff --check HEAD~3
```

Expected: only the planned frontend files and no backend production changes.
