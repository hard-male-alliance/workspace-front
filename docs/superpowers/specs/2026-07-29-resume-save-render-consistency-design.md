# 简历保存与 PDF 生成一致性修复设计

## 目标

保证用户修改中栏内容后直接点击“生成 PDF 预览”时，系统先保存最新内容，再基于保存成功后的权威简历版本生成 PDF；显式重新加载服务器版本时，不再保留会遮蔽服务器内容的旧本地草稿。

## 已确认根因

1. 后端 operation 响应的 ETag 基于整个 `ResumeOperationResult`，而下一次 `If-Match` 校验基于 `ResumeDocument`，造成成功保存后的下一次保存返回 412。
2. 中栏在 `blur` 时保存，右栏在 `click` 时生成；右栏只读取 React 渲染时的布尔锁，可能在保存刚启动时仍使用旧 revision。
3. 权威重载更新父级 `editor`，但子编辑器的 `itemDrafts` 因组件 key 不变而继续存在并遮蔽服务器值。
4. PDF 成功和过期提示只比较 Artifact 与服务器 revision，没有纳入未保存本地草稿。

## 最小设计

### 后端

- operation 成功响应的正文保持 `ResumeOperationResult` 不变。
- operation 响应的 ETag 改为基于其中的 `resume` 表示计算，使其可以直接作为下一次 Resume `If-Match`。
- 幂等回放继续保存并返回同一响应头，不放宽任何并发校验。

### 前端

- 页面级 mutation lane 记录当前写入 Promise 和最新权威 `editor`。
- PDF 生成开始前等待已由 `blur` 启动的保存结束，再读取最新权威 revision。
- 保存失败或进入权威恢复状态时不创建 PDF Job。
- 成功执行“重新加载服务器版本”后，使用现有 `authorityReloadRevision` 重置子编辑器本地草稿。
- 子编辑器向父级报告是否有未保存草稿；预览区将该状态纳入“PDF 是否最新”的判断。

## 错误处理

- 412 仍进入现有权威恢复流程，不自动覆盖服务器版本。
- 保存失败时保留用户草稿，并阻止生成错误版本的 PDF。
- 显式重新加载服务器版本代表用户选择服务器权威值，因此允许清除本地草稿。

## 定向测试

1. 后端：第一次 operation 响应的 ETag 可直接用于第二次 operation，连续两次均成功。
2. 前端：修改输入后立即点击生成，保存完成前不创建 PDF，完成后使用新 revision。
3. 前端：显式重新加载后，本地草稿不再遮蔽服务器值。
4. 前端：存在未保存草稿时，不把当前 PDF 表述为已包含最新修改。

## 非目标

- 不修改 XeLaTeX、PDF Artifact 内容或权威 PDF 展示策略。
- 不删除或放宽 ETag/If-Match 并发保护。
- 不修改简历 Agent、知识库、模拟面试或其他页面。
