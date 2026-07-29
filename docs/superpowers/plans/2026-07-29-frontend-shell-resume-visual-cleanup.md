# RoleStory Frontend Shell and Resume Visual Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简 RoleStory 全局界面，并让简历个人信息与多个普通板块能够以一致外观独立展开。

**Architecture:** 只修改 React 展示层和对应样式、文案、测试。工作区 Session、Gateway、简历领域模型、保存命令、并发保护和 PDF Artifact 权威逻辑保持不变。

**Tech Stack:** React 19、TypeScript 6、React Testing Library、Vitest、CSS、i18next。

## Global Constraints

- 只修改 `workspace-front`。
- 不修改后端、HTTP DTO、Gateway、工作区权限模型或真实 PDF 权威展示策略。
- 工作区切换 UI 删除后仍保留 `workspaceSession` 和 `selectWorkspace` 能力。
- 个人信息继续使用 `resume.profile`，不转换为普通 `section`。
- PDF 失败、进度、取消、过期和版本落后状态必须保留。
- 每个产品改动先写最小失败测试，再实施最小修复。

---

### Task 1: 精简全局壳层并统一 RoleStory 品牌

**Files:**

- Modify: `packages/app/src/app/WorkspaceShell.tsx`
- Modify: `packages/app/src/ui/HostedAuthenticationScreen.tsx`
- Modify: `packages/app/src/ui/HostStartupFailure.tsx`
- Modify: `packages/app/src/i18n/resources.ts`
- Modify: `packages/app/src/styles/shell/base.css`
- Modify: `packages/app/src/styles/app-support/responsive.css`
- Test: `packages/app/tests/integration/WorkspaceApp.app-shell.dom.test.tsx`

**Interfaces:**

- Consumes: 现有 `workspaceSession`、`workspaceAccess` 和 `onSignOut`。
- Produces: 只显示 RoleStory、主题、退出和左下角当前账户的壳层。

- [ ] **Step 1: Write the failing shell expectations**

在壳层测试中断言：

```tsx
expect(screen.getByText('RoleStory')).toBeInTheDocument()
expect(screen.queryByRole('button', { name: '反馈' })).not.toBeInTheDocument()
expect(screen.queryByRole('combobox', { name: '当前工作区' })).not.toBeInTheDocument()
expect(screen.queryByText('所有者')).not.toBeInTheDocument()
expect(screen.queryByText('个人版')).not.toBeInTheDocument()
expect(screen.queryByText('私有部署')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the shell test and verify RED**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.app-shell.dom.test.tsx
```

Expected: FAIL，因为旧品牌、反馈按钮、工作区选择器和权限摘要仍存在。

- [ ] **Step 3: Implement the minimal shell cleanup**

在 `WorkspaceShell` 中：

```tsx
<span className="aw-brand-text">RoleStory</span>
```

删除反馈按钮、工作区控件和账户区域中的工作区及权限摘要，只保留：

```tsx
<strong title={workspaceAccess.data.currentUser.displayName}>
  {workspaceAccess.data.currentUser.displayName}
</strong>
```

同步将登录页、启动失败页和 `app.homeAria` 的可见品牌改为 `RoleStory`，删除已无消费者的样式。

- [ ] **Step 4: Run the shell test and verify GREEN**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.app-shell.dom.test.tsx
```

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add packages/app/src/app/WorkspaceShell.tsx packages/app/src/ui/HostedAuthenticationScreen.tsx packages/app/src/ui/HostStartupFailure.tsx packages/app/src/i18n/resources.ts packages/app/src/styles/shell/base.css packages/app/src/styles/app-support/responsive.css packages/app/tests/integration/WorkspaceApp.app-shell.dom.test.tsx
git commit -m "feat(ui): simplify RoleStory application shell"
```

### Task 2: 删除工作台冗余权限与技术说明

**Files:**

- Modify: `packages/app/src/app/home/WorkspaceHomePage.tsx`
- Modify: `packages/app/src/styles/workspace/home.css`
- Test: `packages/app/tests/integration/WorkspaceApp.workspace-home.dom.test.tsx`

**Interfaces:**

- Consumes: 现有 `WorkspaceHomeModel`。
- Produces: 不展示角色、套餐、数据区域及服务端权威技术说明的工作台。

- [ ] **Step 1: Write the failing home expectations**

```tsx
expect(screen.queryByText('角色')).not.toBeInTheDocument()
expect(screen.queryByText('套餐')).not.toBeInTheDocument()
expect(screen.queryByText('数据区域')).not.toBeInTheDocument()
expect(screen.queryByText('数据来自当前工作区，操作结果以服务端确认为准。')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the home test and verify RED**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.workspace-home.dom.test.tsx
```

Expected: FAIL，因为旧摘要和说明仍存在。

- [ ] **Step 3: Remove display-only markup**

删除 `aw-workspace-authority-summary` 中的 `<dl>` 和 `aw-workbench-notice`，保留工作区名称状态标记；删除仅服务于这些节点的 CSS。

- [ ] **Step 4: Run the home test and verify GREEN**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.workspace-home.dom.test.tsx
```

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add packages/app/src/app/home/WorkspaceHomePage.tsx packages/app/src/styles/workspace/home.css packages/app/tests/integration/WorkspaceApp.workspace-home.dom.test.tsx
git commit -m "feat(ui): remove redundant workspace metadata"
```

### Task 3: 统一个人信息外观并支持多板块展开

**Files:**

- Modify: `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- Modify: `packages/app/src/styles/resume/workspace.css`
- Test: `packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`

**Interfaces:**

- Consumes: `UiResumeSectionId`、现有 profile/section 保存函数和拖动排序函数。
- Produces: `expandedSectionIds: ReadonlySet<UiResumeSectionId>` 和独立 `profileExpanded` 展示状态。

- [ ] **Step 1: Write failing multi-expand tests**

测试先点击第二个普通板块标题，再断言第一个和第二个板块的编辑字段同时存在；点击第一个标题后仅第一个关闭。另断言个人信息标题具备 `aria-expanded`，但不存在个人信息的删除或排序按钮。

- [ ] **Step 2: Run the resume editor test and verify RED**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx
```

Expected: FAIL，因为当前只有单个 `focusedSectionId`，个人信息也没有折叠按钮。

- [ ] **Step 3: Implement independent expansion state**

用集合替换单值状态：

```tsx
const [expandedSectionIds, setExpandedSectionIds] = useState<ReadonlySet<UiResumeSectionId>>(
  () => new Set(editor.resume.sections.slice(0, 1).map((section) => section.id))
)
const [profileExpanded, setProfileExpanded] = useState(true)
```

实现不可变切换：

```tsx
const toggleSection = (sectionId: UiResumeSectionId): void => {
  setExpandedSectionIds((current) => {
    const next = new Set(current)
    if (next.has(sectionId)) next.delete(sectionId)
    else next.add(sectionId)
    return next
  })
}
```

标题按钮使用 `aria-expanded`，正文仅由各自展开状态控制。个人信息复用同一卡片和标题布局，但不增加拖动、排序和删除操作。

- [ ] **Step 4: Run the resume editor test and verify GREEN**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx
```

Expected: PASS，且现有字段保存、权威重载和结构操作测试继续通过。

- [ ] **Step 5: Commit**

```powershell
git add packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx packages/app/src/styles/resume/workspace.css packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx
git commit -m "feat(resume): allow independent section expansion"
```

### Task 4: 精简 PDF 成功后的常驻状态

**Files:**

- Modify: `packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx`
- Test: `packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx`
- Test: `packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx`

**Interfaces:**

- Consumes: 现有 `jobAuthority`、`artifact`、进度和错误状态。
- Produces: 成功 Artifact 展示时不显示成功文案和元数据，但保留非成功状态。

- [ ] **Step 1: Write failing PDF status expectations**

成功加载 PDF 后断言：

```tsx
expect(screen.queryByText('PDF 已生成。')).not.toBeInTheDocument()
expect(screen.queryByText(/页 ·/u)).not.toBeInTheDocument()
```

同时保留现有失败、过期、进度和旧版本状态断言。

- [ ] **Step 2: Run the focused PDF tests and verify RED**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
```

Expected: FAIL，因为成功文案和 Artifact 元数据仍常驻。

- [ ] **Step 3: Hide only redundant success output**

当 Job 为 `succeeded` 且 Artifact 已加载时令 `jobStatus` 为 `null`，并删除 `pdfMetadata` 段落。保留所有非成功状态、进度和错误节点。

- [ ] **Step 4: Run focused tests and static checks**

Run:

```powershell
corepack pnpm exec vitest run --project dom packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add packages/app/src/contexts/resume/presentation/ResumePreviewPanel.tsx packages/app/tests/integration/WorkspaceApp.resume-editor.dom.test.tsx packages/app/tests/integration/WorkspaceApp.resume-artifact.dom.test.tsx
git commit -m "feat(resume): simplify completed PDF status"
```
