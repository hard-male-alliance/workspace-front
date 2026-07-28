# 简历中栏语义内容完整编辑设计

## 目标

让简历工作台中栏显示并允许用户修改会进入真实 PDF 的用户语义文字。中栏继续作为结构化语义编辑器，不模拟 PDF 排版；右栏真实 PDF 继续作为最终排版权威。

验收时，同一简历 revision 中由用户提供且被 PDF 渲染器消费的文字，不得出现“PDF 中存在但中栏完全不可见”的情况。

## 非目标

- 不从 PDF 文件反向提取或同步文字。
- 不把中栏改造成所见即所得（WYSIWYG）排版器。
- 不修改真实 XeLaTeX 渲染链路。
- 不改变阶段一确立的权威 PDF、过期提示和重新生成策略。
- 不删除 ETag、revision、幂等或未知写结果恢复保护。
- 不在本次增加模板样式、标签、实体类型、拖拽排序或富文本工具栏。

## 已确认的根因

完整 Resume 文档已经包含 `dateRange`、`summary`、`highlights`、`skills` 和 `url`；API V2 adapter 也无损映射这些字段，后端 PDF 渲染器会消费这些字段。

当前 `ResumeWorkspace` 中栏只遍历 `title`、`subtitle`、`organization`、`location` 四个标量字段。领域输入 `UiResumeItemTextField` 同样只允许这四个字段，因此缺失内容既不能显示，也不能直接编辑。这是前端编辑投影不完整，不是数据丢失或 PDF 使用旧字段。

## 用户体验

### 中栏定位

中栏显示“PDF 语义源数据”，右栏显示同一数据经过模板和 XeLaTeX 排版后的结果。文字内容应一致；模板生成的固定标签、标点、日期本地化和视觉布局不要求逐字符一致。

### 个人信息

在中栏顶部显示并编辑：

- 姓名；
- 职业标题；
- 个人简介；
- 现有联系方式的标签、值和安全链接。

本次只编辑已有联系方式，不增加联系方式的新增、删除和排序。

### 板块

保留现有板块标题和板块正文编辑。将“语义内容”标签改为更容易理解的“板块补充说明（可选）”，避免用户把空的 `section.content` 误认为结构化经历内容丢失。

### 结构化条目

保留现有字段，并补充：

- 开始日期；
- 结束日期或“至今”；
- 条目摘要；
- 经历要点；
- 技能；
- 安全链接。

`tags`、内部 ID、`kind` 和 `visible` 不是 PDF 中的用户文字，本次不新增编辑控件。

每条 `highlight` 使用独立 textarea。新增或删除要点时，整组 `highlights` 作为一个原子字段保存；修改已有要点时使用现有 `replaceUiResumeRichTextText` 重定位未受影响的 marks。

技能使用“一行一项”的 textarea，因为技能字符串本身不允许换行；保存时去除空行并保持原顺序。不得用逗号拆分，以免破坏包含逗号的合法技能名称。

日期使用两个文本输入和一个“至今”选项，保留 `YYYY`、`YYYY-MM`、`YYYY-MM-DD` 的原始精度。非法日期在前端显示校验错误且不发请求，服务端继续进行最终校验。

## 架构与复用

数据流保持不变：

```text
ResumeWorkspace
-> ResumeGateway 业务方法
-> API V2 adapter
-> 现有 operation batch / set_field
-> 后端 Resume 聚合校验
-> 最新权威 ResumeEditorModel
```

复用以下现有实现：

- `UiResumeDocument`、`UiResumeProfile`、`UiResumeItem`、`UiResumeRichText`；
- `replaceUiResumeRichTextText` 和现有展示 selectors；
- `ResumeGateway`、API V2 operation batch 和 InMemory Gateway；
- 当前命令 ID、幂等、revision、concurrency token 和恢复屏障；
- 当前输入框、textarea、错误提示和写锁样式；
- 后端已经支持的 root/profile、contact 和 item `set_field` 路径。

不得复用 `ResumeSemanticPreview` 作为可编辑组件。它同时服务历史 revision 只读页面，把编辑行为放进去会破坏其职责。可以复用其字段顺序和纯展示 selector。

## 领域端口

保留 `updateResumeItem` 业务方法，但把输入改成按字段判别的联合类型，使不同字段只能携带正确值：

- 标量文本：`string | null`；
- 日期范围：`UiResumeDateRange | null`；
- 富文本摘要：`UiResumeRichText | null`；
- 经历要点：`readonly UiResumeRichText[]`；
- 技能：`readonly string[]`。

新增两个窄业务方法：

- `updateResumeProfile`：修改姓名、职业标题或简介；
- `updateResumeContact`：修改已有联系方式的标签、值或 URL。

这些方法仍在 adapter 中转换成现有 `set_field` operation，不暴露 path、HTTP 或 DTO 给页面。

## 保存与状态

- 继续采用失焦保存，不增加全局“保存”按钮。
- 每个控件维护独立草稿键；正在保存时只锁定相关写操作。
- 相同草稿与权威值一致时不发请求。
- 成功后吸收服务端返回的完整权威 `ResumeEditorModel`，只清理已确认草稿。
- revision 冲突、未知写结果和网络失败继续进入现有恢复或错误状态，不显示假成功。
- 语义修改成功后，已有 PDF 仍对应旧 revision 时继续显示现有过期状态；用户点击“生成新的 PDF 预览”后才替换右栏权威 PDF。

## 错误处理

- 日期、必填姓名、字段长度和安全 URL 在前端进行与契约一致的最小校验。
- 后端返回的验证错误继续通过统一 Problem 映射展示。
- 数组字段必须整体成功或整体失败，不能局部假成功。
- 页面刷新后以服务端权威文档重建控件，不从 PDF 或临时 DOM 恢复数据。

## 测试策略

实施使用 TDD：

1. 在现有 Resume editor DOM 测试中构造带日期、摘要、四条 highlights、技能和 URL 的条目，先证明当前中栏缺失这些文字。
2. 增加个人信息和联系方式可见测试。
3. 验证修改单条经历要点后，Gateway 收到完整且类型正确的 `highlights` 值。
4. 验证摘要编辑使用 `replaceUiResumeRichTextText`，不无条件清空未触及 marks。
5. 验证日期非法时不发请求。
6. 验证 API V2 adapter 为各业务字段生成正确的 `entity_id`、`field_path` 和 JSON 值。
7. 验证成功后采用最新 revision，PDF 不被前端伪造为已更新。

只执行一至三条最相关的定向测试，以及必要的 TypeScript 类型检查。后端已有 `set_field` 和 PDF highlights 渲染测试；若前端请求完全符合现有契约，本次不修改后端。

## 预计修改范围

前端预计涉及：

- `packages/app/src/contexts/resume/domain/models.ts`
- `packages/app/src/contexts/resume/application/gateway.ts`
- `packages/app/src/contexts/resume/infrastructure/memory/gateway.ts`
- `packages/app/src/contexts/resume/presentation/ResumeWorkspace.tsx`
- `packages/product-runtime/src/api-v2-gateways.ts`
- 现有 Resume editor 与 runtime 定向测试
- 必要的既有 resume 样式和国际化文本

如果当前后端契约和运行时测试证明上述字段可通过现有 `set_field` 保存，则后端零改动；发现契约不支持时停止并报告，不扩展后端协议。

## 验收标准

- PDF 中的四条实习经历要点在中栏逐条可见。
- 用户修改其中一条并失焦后，中栏显示服务端确认的新值。
- 刷新页面后仍显示新值。
- 重新生成 PDF 后，右栏显示修改后的文字。
- 姓名、职业标题、简介、联系方式、日期、摘要、技能等 PDF 用户文字均能在中栏找到对应控件。
- 旧 PDF 与当前简历 revision 不一致时继续遵守既有过期策略。
- 控制台没有新增错误，现有标题、公司、地点编辑和 proposal/PDF 状态闭环不回退。
