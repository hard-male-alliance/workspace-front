# Hide Secondary UI Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide selected resume, interview-report, and knowledge-search entries without removing their underlying behavior.

**Architecture:** Apply the native `hidden` attribute at the existing presentation boundary. Keep routes, models, gateways, and transport behavior unchanged.

**Tech Stack:** React 19, TypeScript 6, React Router, Vitest, Testing Library.

## Global Constraints

- Modify presentation files and the smallest relevant DOM tests only.
- Keep all routes and business logic intact.
- Do not add dependencies, feature services, global CSS, or backend changes.

---

### Task 1: Hide resume secondary navigation

**Files:**
- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Test: `packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`

- [ ] Add assertions that “生成与导出”“版本与建议”“打开模板与样式设置” are absent from accessible navigation while “生成 PDF 预览” remains available.
- [ ] Run the targeted test and confirm it fails because the links are visible.
- [ ] Add `hidden` to the desktop link container and the three corresponding mobile links.
- [ ] Re-run the targeted test and confirm it passes.

### Task 2: Hide observable communication metrics

**Files:**
- Modify: `packages/app/src/contexts/interview/presentation/InterviewRoomPage.tsx`
- Test: the smallest existing interview report DOM test that renders `LoadedSummary`

- [ ] Add an assertion that “可观察沟通指标” is absent while “下一次练习” remains visible.
- [ ] Run the targeted test and confirm it fails because the section is visible.
- [ ] Add `hidden` to the existing metrics `section`.
- [ ] Re-run the targeted test and confirm it passes.

### Task 3: Hide the knowledge-search entry

**Files:**
- Modify: `packages/app/src/contexts/knowledge/presentation/KnowledgePage.tsx`
- Test: `packages/app/src/contexts/knowledge/presentation/KnowledgePages.dom.test.tsx`

- [ ] Add assertions that “搜索知识库” is absent while “上传文件” and “新建手动笔记” remain visible.
- [ ] Run the targeted test and confirm it fails because the search link is visible.
- [ ] Add `hidden` to the existing search `Link`.
- [ ] Re-run the targeted test and confirm it passes.

### Task 4: Focused verification

**Files:**
- Verify all modified files.

- [ ] Run Prettier check on the modified files.
- [ ] Run the three targeted DOM tests.
- [ ] Run TypeScript typecheck if the targeted tests expose a shared compilation failure.
- [ ] Review `git diff --check` and confirm no route, gateway, contract, or backend changes exist.

