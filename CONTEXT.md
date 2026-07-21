# 前端领域上下文图

本文件定义本仓库采用的统一语言（Ubiquitous Language）与上下文边界。共享 API 的正式语义仍只来自只读的 `workspace-shared-docs/contracts/v1/`；本文件只描述前端如何消费该契约，不复制或修改契约。

## 产品上下文

前端采用模块化单体（Modular Monolith），由四个业务上下文和三个支撑区域组成。上下文不是页面目录的别名，而是模型、端口、变化原因与测试故障面的共同边界。

| 上下文               | 拥有的语言与状态                                                 | 不拥有的内容                                    |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Workspace Experience | 当前 Workspace、首页聚合投影、跨能力入口                         | Resume 编辑规则、Interview 会话、Knowledge 摄取 |
| Resume Authoring     | Resume、Section、Template、Proposal、Render Job、Artifact        | HTTP 状态码、Electron 文件路径                  |
| Interview Practice   | Scenario、Session、Transcript、Runtime、Report                   | 麦克风权限实现、Knowledge Source 内部策略       |
| Knowledge            | Source、Version、Ingestion Job、Search Result、Visibility Policy | multipart DTO、浏览器 `File` 的宿主细节         |

支撑区域：

- App Shell：路由、主题、语言、布局和上下文组合，不拥有业务状态。
- Host Runtime：Web 与 Electron 的宿主能力契约，不拥有业务规则。
- Observability：低敏诊断端口和适配器，不读取用户内容。

`State Gallery` 是开发验收工具，不是业务上下文。

## 上下文关系

```text
Workspace Experience ──入口/聚合──> Resume Authoring
                     ├────────────> Interview Practice
                     └────────────> Knowledge

Interview Practice ──只读选择投影──> Resume Authoring
                   └──────────────> Knowledge

Web composition ─────┐
                     ├──> App Shell + 四个上下文
Desktop composition ─┘
```

跨上下文只传递刻意发布的标识或只读投影，不 deep import 另一个上下文的内部文件。Workspace Experience 是下游聚合体验，不是其他上下文的上游领域模型。

## 依赖规则

每个业务上下文采用以下方向：

```text
presentation -> application -> domain
adapter ------> application/domain
composition --> presentation + adapter
```

硬性规则：

1. Domain 不依赖 React、DOM、Node.js、Electron、HTTP、IPC 或 transport DTO。
2. Presentation 不识别 HTTP/IPC 错误，也不导入 adapter。
3. Adapter 在边界把正式 transport 数据与错误映射为应用模型和安全错误。
4. 业务上下文之间只经公开入口和显式端口协作。
5. Web 与 Desktop 是唯一生产组合根；Mock 只能从测试入口或明确的开发演示入口装配。
6. Electron renderer 不直接导入 Node.js/Electron；preload 不暴露通用 IPC；main 不依赖 React/DOM。
7. `workspace-shared-docs` 缺失、revision 不匹配或存在本地修改时，契约消费流程必须失败，不得回退到副本。

## 跨上下文用户流程

- Workspace 首页可读取 Resume 卡片投影以生成“继续编辑”入口，但不修改 Resume。
- Interview 配置可读取 Resume 与 Knowledge 的选择投影；会话状态仍由 Interview Practice 拥有。
- Resume PDF 导出由 Resume Authoring 表达用户意图，由宿主端口执行下载或原生保存。
- Knowledge 上传由 Knowledge 表达内容与状态；Web `File`、Electron 文件令牌和 multipart 仅属于各自 adapter。

这些边界是当前信息下的设计基线。若产品语言或正式契约变化，应先更新上下文图和 ADR，再调整可执行依赖规则。
