# 阶段一：权威 PDF 预览一致性设计

## 目标

只修复简历编辑器右栏的 PDF 一致性问题：

- 右栏只能显示后端真实生成并完成内容校验的 PDF；
- 中栏手动编辑不会自动生成 PDF；
- 手动编辑后保留上一份真实 PDF，并明确标记它落后于当前 Resume revision；
- 用户点击“生成 PDF 预览”后，为当前服务器权威 revision 生成并原子替换右栏 PDF；
- 同一 Resume revision、模板 ID 与模板版本的重复生成必须具有一致的页面文本和栅格化视觉结果；
- 本地运行必须继续使用真实 XeLaTeX，不允许 Mock、HTML 语义预览或静默降级冒充 PDF。

本阶段不修复 AI Proposal 确认、助手续答、错误 412 或模拟面试 WebSocket。

## 当前问题

最新 `main` 的 `ResumePreviewPanel` 在没有有效 PDF lease 时渲染
`ResumeSemanticPreview`。该 React/CSS 视图不是 XeLaTeX 产物，因此会让右栏在
“HTML 语义预览”和“真实 PDF”之间切换，形成内容与样式变化。

`ResumeWorkspace` 又使用 `key={previewGeneration}` 挂载预览面板。Resume revision
变化时组件会整体卸载，当前 Blob URL lease 被释放，右栏重新退回 HTML 语义预览。
这会把“编辑后尚未重新生成 PDF”错误展示成另一份看似最新但样式不同的简历。

备份分支 `backup/pre-main-sync-20260728-130509` 已包含一个持久化 PDF lease 的候选
实现，但它只经过受控 DOM/内存 Gateway 测试，不能整体 cherry-pick，也不能直接视为
已修复。实现时只选择与 PDF 生命周期有关的最小差异，并通过真实运行链路重新验证。

## 状态设计

右栏只允许四种可见状态：

1. `empty`：尚无真实 PDF，显示空状态和“生成 PDF 预览”按钮；
2. `ready-current`：显示与当前 Resume revision 完全匹配的真实 PDF；
3. `ready-stale`：继续显示上一份真实 PDF，同时明确显示其 revision 落后；
4. `rendering`：生成当前 revision 时继续显示上一份真实 PDF；若此前没有 PDF，则显示
   纯加载空状态。

失败时保留最后一份已验证 PDF，并在其外部显示错误；不得回退到
`ResumeSemanticPreview`。

显示状态必须把产物身份与 Blob URL lease 绑定为一个不可拆分的值：

```ts
interface DisplayedResumePdf {
  readonly artifact: UiWorkspaceArtifact
  readonly lease: ResumePdfPreviewLease
}
```

`artifact.subject` 必须精确引用当前 Resume ID 和生成时冻结的 revision。只有完成以下
校验后才允许提交 `DisplayedResumePdf`：

- Job 成功且只有一个 PDF `result_ref`；
- Artifact subject 与 Render specification 的 Resume ID/revision 一致；
- media type、文件大小、EOF 和 SHA-256 校验通过；
- Blob URL lease 创建成功。

## 生命周期

`generation` 只负责判定异步 Render/下载结果是否仍可提交，不能控制已经显示的 PDF
lease 生命周期。

Resume revision 或模板身份变化时：

- 取消仍在执行的旧 generation 请求；
- 清理旧 Job、恢复候选、错误和命令状态；
- 保留最后一份已验证 PDF lease；
- 根据 Artifact subject 判断并显示 `ready-current` 或 `ready-stale`。

只有以下事件可以释放当前显示的 lease：

- 新 PDF 完成全部校验并原子替换旧 PDF；
- Artifact 明确过期且产品不允许继续展示；
- 预览面板真正卸载或应用结束。

`ResumeWorkspace` 不再使用 revision/template generation 作为
`ResumePreviewPanel` 的 React `key`，避免一次普通编辑销毁 PDF。

## 用户交互

### 手动编辑

中栏保存成功并获得新 revision 后：

- 不自动创建 Render Job；
- 右栏仍显示旧 PDF；
- 显示“当前 PDF 基于较早的简历版本生成”；
- 用户点击按钮后，只为当前 editor 中的权威 revision 创建 Render Job。

### 手动生成

点击“生成 PDF 预览”时冻结完整 Render specification。Job 运行期间不能被后续旧异步
结果覆盖。新 PDF 完成校验后原子替换旧 PDF，并立即释放旧 Blob URL。

重复点击必须沿用现有幂等命令、重复提交保护、取消和恢复语义，不新增第二套网络逻辑。

### 无原生内嵌查看器

浏览器明确不支持内嵌 PDF 时，只提供真实 Artifact 的下载/保存能力和说明，不得显示
HTML 简历作为视觉替代品。

## 测试与真实验收

### 自动化反馈环

先在现有 Resume Artifact DOM 测试中增加失败用例：

- 首次没有 PDF 时不存在语义预览；
- 生成真实 PDF 后，手动保存新 revision 不销毁 iframe/Blob URL；
- 旧 PDF 被标记为 stale，且不会自动创建新 Render Job；
- 手动生成新 revision 后才替换 iframe，并释放旧 lease；
- Render 失败时继续保留旧 PDF；
- 组件真正卸载时释放最后一个 lease。

测试必须观察生产组件和 lease 生命周期，不能只断言 Mock Gateway 的内部调用结果。

### 真实运行验收

使用当前本地真实链路：

```text
浏览器 -> 5173 Web -> 9000 本地入口 -> 8000 FastAPI
       -> PostgreSQL -> Render Job -> XeLaTeX -> Artifact -> Bearer PDF stream
```

验收步骤：

1. 对当前 Resume 手动生成一次 PDF，并记录 Resume revision、Artifact subject 和模板；
2. 栅格化 PDF，保存页面文本与图像摘要；
3. 手动修改中栏并保存，确认右栏仍是旧 PDF且出现 stale 提示；
4. 点击生成，确认新 Artifact subject 精确等于新 revision；
5. 确认右栏内容与新服务器 revision 一致；
6. 对同一 revision/template 再生成一次，比较页数、提取文本和固定 DPI 栅格图；
7. 确认日志中调用真实 XeLaTeX，且不存在 Mock/semantic fallback。

## 完成标准

- 右栏任何时候都不出现 `ResumeSemanticPreview`；
- 手动编辑不会自动生成 PDF；
- 旧 PDF 不会因 revision 变化而消失；
- stale 状态明确且不会把旧 PDF 宣称为当前版本；
- 手动生成只接受当前权威 revision 的 Artifact；
- 新 PDF 完成后原子替换旧 PDF；
- 同 revision/template 的真实 PDF 视觉比较一致；
- 相关 DOM 测试、类型检查、lint、前端构建和真实浏览器验收通过；
- 后端使用真实 XeLaTeX，未引入 Mock 或降级路径。
