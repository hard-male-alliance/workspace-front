# v2 契约实施缺口与运行时边界

本文件不定义、替代或修改 `workspace-shared-docs/contracts/v2/` 的四个正式发布物。v2 已发布，但当前前端和已提交后端仍未完成 v2 运行时迁移。生产组合显式选择 v1 HTTP runtime；失败时不自动改用 v2、内存 Gateway 或静态数据。

完整的页面级证据和状态分类见 [`frontend-capability-audit.md`](frontend-capability-audit.md)。

## 当前已确认事实

- 共享标准唯一来源是 `workspace-shared-docs/contracts/v2/{contract.md,schema.jsonc,examples.jsonc,diff.md}`。
- 当前已提交后端产品 router 使用 `/api/v1`，没有 `/api/v2`。
- 当前已提交后端没有前端启动所调用的 `/api/v1/me` 与 `/api/v1/workspaces`。
- 本地后端存在未提交的 v1 password-session 工作；它不是本分支可依赖的冻结能力，也不等于 v2 OAuth/OIDC。
- 前端当前没有 OAuth Authorization Code + PKCE、Bearer token 生命周期、Electron 系统浏览器回调或系统安全存储能力。
- Web 和 Electron 生产组合只装配 HTTP Gateway，不装配内存 Gateway；缺失能力必须显式失败。
- 当前 Resume/Knowledge/Interview transport DTO 与路由仍是 v1，不能与 v2 DTO 混用。
- Workspace 现在由用户显式选择；没有有效默认偏好时不再选择列表第一项。切换会使 Workspace 资源树失效重载。

## v2 实施缺口

| 范围         | v2 已冻结内容                                                               | 当前缺口与前端处理                                                                                         |
| ------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Identity     | OIDC discovery、Authorization Code + PKCE、token/revoke/JWKS/userinfo       | 前后端均无完整实现。前端不伪造 token、Cookie、`X-Mock-*` 或可信代理断言；启动显示安全错误。                |
| Current user | `/api/v2/me` 与 `CurrentUser`                                               | 当前 v1 `/me` 调用无已提交后端路由，现有 validator 也是 v1。不能标记 `REAL_API`。                          |
| Workspace    | `WorkspaceAccess`、成员资格和 `/workspaces/{workspace_id}` 授权路径         | 当前 v1 `/workspaces` 调用无已提交后端路由。前端已有显式选择状态，但真实 authority 尚未联调。              |
| Page/Problem | v2 Page、`errors[]`、`Retry-After`                                          | 当前公共解析器是 v1 `total_estimate/retry_after_ms/violations`。只能由独立 v2 adapter 替换，不能混合容错。 |
| Resume       | Workspace 路径、六种 operation、Revision/Proposal、统一 Job/Artifact        | 当前 v1 adapter 保留旧 DTO/路径。详情端口已显式携带 Workspace 并校验响应归属，但仍不是 v2 tenant route。   |
| Knowledge    | `public_config`、Connection、UploadSession、Version、Job、Search/Evaluation | 当前只有 v1 read/PATCH 子集；create/upload/search UI 保持禁用。                                            |
| Interview    | v2 scenario/session、connection、realtime、end/report Job                   | 当前 v1 read/create 子集与 v2 不兼容；runtime 明确声明 realtime/media 不可用。                             |
| Job/Artifact | Workspace 统一 Job/Artifact API                                             | 当前只有 v1 Resume render 专用轮询与 artifact 路径；下载没有 v2 Bearer/Workspace 能力。                    |
| Event/SSE    | `ApiEvent`、Workspace event stream、恢复和重同步                            | 前端尚无统一 SSE client、去重、顺序、`Last-Event-ID` 或恢复窗口处理。                                      |
| Diagnostics  | 独立运维协议                                                                | 前端与当前后端路径仍不一致；诊断连通不能证明产品 API v2 可用。                                             |

## 当前 v1 runtime 的约束

- v1 adapter 是迁移期的明确实现，不是 v2 兼容层。
- 页面不得构造 transport path；版本只由宿主配置、组合根、HTTP client 和 adapter 持有。
- Resume/Knowledge/Interview 的客户端 `workspace_id` 过滤不能作为授权证明。真实 v2 切换必须使用路径 Workspace 和服务端 membership 授权。
- v1 Problem、Page、operation、render Job 和 artifact DTO 不得被复用为 v2 类型。
- 当前模板详情前端路径与已提交后端路径存在差异，联调前必须按版本拆分验证。
- 任何受保护能力在身份链路完成前都不能宣称生产可用。

## v2 能力准入条件

1. 后端已提交并部署相应 v2 endpoint、身份与 Workspace 授权；
2. method、path、headers、状态码、Location/ETag/Retry-After、Problem 和响应包装与四个发布物一致；
3. Web 与 Electron 对同一 v2 fixture 通过 runtime validator 和 adapter 映射测试；
4. 401/403/404/409/412/422/429/5xx、取消、超时和 outcome-unknown 均有可见且安全的状态；
5. 页面继续只依赖领域 Gateway，不接触 OAuth token、HTTP path 或 transport DTO；
6. 没有 major-version fallback、客户端租户过滤、身份头伪造、Mock fallback 或静态假成功；
7. 涉及事件和实时传输时，完成去重、顺序、恢复、最终权威读取、取消和卸载清理测试。

Identity 还必须满足：Web 使用内存 token 和 PKCE；Electron 使用系统浏览器、合规 callback 与操作系统安全存储；两端都不能使用静态 client secret。离线 Resume operation 还需稳定 principal、按 origin/user/workspace 隔离的加密队列、登出清理和冲突停止策略。
