# ADR 0002：保护生产 API 真相与失败语义

- 状态：Accepted
- 日期：2026-07-22

## 背景

生产 Web 与 Electron 曾把进程内演示数据作为默认组合，并在数据加载失败时向用户显示“演示数据暂时不可用”。这同时混淆了三件不同的事实：产品是否接入正式 API、后端是否确认了某次操作，以及当前前端是否实现了相应能力。

共享契约目前由 Markdown 路由语义与 JSON Schema 共同构成，尚未形成统一 OpenAPI entrypoint。契约冻结了 Bearer 请求头要求，却没有冻结产品身份的 issuer、client ID、scope、redirect URI 与 token 生命周期；`download_url` 也没有冻结跨源对象存储或 CDN allowlist。前端不能用临时路由、静态 token、Cookie、任意 HTTPS URL 或本地成功状态填补这些空白。

## 决策

### 1. 生产组合只使用正式 Gateway

Web 与 Electron renderer 只通过共享产品组合根创建 `HttpWorkspaceGateway`、`HttpResumeGateway`、`HttpInterviewGateway` 与 `HttpKnowledgeGateway`。In-memory adapter、fixture 与示例 ID 只从测试入口导出，不进入生产依赖图。

未冻结能力必须返回明确的 capability-unavailable 状态。不得创建本地资源、预置转录、伪造上传或搜索结果，也不得用“稍后同步”的文案暗示服务端已接受操作。

### 2. Adapter 证明协议消息，不证明后端内部实现

HTTP client 与领域 adapter 负责验证：

- path、query、method、媒体类型与契约请求头；
- 端点冻结的精确成功状态；
- 创建响应的 `Location` 与返回资源 ID 一致；
- ETag、分页游标、operation result 与 normalized resource 的关联关系；
- 未受信任 JSON 满足冻结 Schema 后才进入领域模型；
- PDF URL 在跨源策略冻结前只能指向同 API origin 的精确 artifact content 资源。

Provider 的持久化副作用、权限数据库和任务执行器属于后端功能测试。前端 adapter 测试不枚举这些内部规则，也不把 consumer fixture 宣称为端到端联调证据。

### 3. 失败按用户可采取的动作分类

页面只展示本地维护的安全文案和格式受限的 support reference，不展示后端 `title`、`detail`、URL、字段值或响应正文。

- 401/403 分别表达身份链路与权限问题；当前尚未接通产品身份时，401 不得伪装成一次已经存在的登录会话过期。
- 409/412 要求读取权威资源后再继续，不自动重放本地写入。
- 400/413/415/422 表达提交内容未被接受，不建议原样重试。
- GET 超时可以原地重试；POST/PATCH 在未收到响应，或只收到无法验证的 2xx 响应时均属于结果未知。网络断开、取消、错误成功状态、非法 JSON、资源身份或 `Location` 不匹配都不能退化成普通“重试”。
- Interview Session 与 Resume Render Job 是创建型命令：展示层为一次用户意图生成稳定 command ID，adapter 将它映射为 `Idempotency-Key`；确认未知结果时必须复用同一个不可变输入、请求体和 key。
- Resume operation 与 Knowledge visibility 都有可读取的权威资源：未知结果或 409/412 会锁住后续写入，先重新 GET 权威版本，再由用户基于新状态发起新的意图；不会自动重放陈旧 mutation。
- 已知 Render Job 的轮询失败只继续 GET 同一个 Job ID，不会再创建一个 Job。
- decoder 在收到 header 后读取 body 失败时保留原始 AbortError/TimeoutError，避免伪装成 malformed JSON；GET 向查询调用方暴露该分类，POST/PATCH 则进一步包装为结果未知，因为服务端此时可能已经执行命令。

RFC 9457 通常要求 consumer 忽略未知扩展成员。本项目拒绝未知顶层字段，是因为冻结 JSON Schema 使用 `additionalProperties: false` 并提供专用 `extensions` bag，而不是 RFC 9457 的通用要求；未来若调整扩展策略，必须同步修改 Schema 与 adapter。

### 4. 用三层证据链和布尔门禁阻止回归

```text
共享契约固定 revision 与 Schema 检查
                ↓
HttpClient / Gateway adapter 契约测试
                ↓
少量用户行为 integration / browser / Electron smoke
```

架构适应度门禁检查生产组合的完整可解析依赖路径，既拒绝直接导入 testing/memory adapter，也拒绝经由 context barrel 或 facade 间接抵达；另以已知高风险文案模式拦截生产 UI 中的 demo/mock/fake/fixture data 或演示、占位、回退数据提示。“Mock interview / 模拟面试”作为产品术语不属于该规则。文案检查是窄范围回归护栏，不是语义证明，仍需代码审阅和用户行为测试覆盖无法静态识别的分支。

Web、Electron 构建输出与 packaged ASAR 还会扫描一组已知 fixture ID、in-memory adapter 名称和高风险产物 URL sentinel，以证明当前已知测试数据没有被打入生产制品。该扫描同样只是高信号布尔护栏，不是对任意业务文本的完整语义证明。

暂不引入 Pact Broker、综合架构健康评分或自动 REST fuzzing。它们分别需要 provider verification 流水线、稳定的阈值治理和完整 OpenAPI/隔离测试环境；当前条件不足时引入只会增加一层不能证明生产事实的工具。

### 5. 身份与跨源 artifact 是上游准入条件

产品身份冻结前不创建空 `TokenProvider`、不读取 `VITE_*` token，也不让 Electron renderer 或 Cookie 冒充 Bearer 身份。上游需要至少确定：

- protected resource 与 authorization server 的信任关系；可采用 RFC 9728 protected resource metadata 配合 RFC 8414/OIDC discovery；
- Web 的 client/BFF 形态、client ID、scope、redirect URI、PKCE、refresh 与 logout；
- Electron 的独立 native client 注册、系统浏览器回调和系统安全存储生命周期；
- artifact origin、每跳 redirect allowlist、CSP/CORS 与认证头传播规则。

在跨源策略冻结前，PDF 预览只接受同 API origin、精确 artifact ID/path 且声明 `application/pdf` 的 URL，并使用 sandboxed iframe。保存端口只接收 artifact ID 与安全文件名；Web adapter 和 Electron main 都会在保存时重新读取完整权威 metadata，不信任 renderer 传来的 URL、`size_bytes` 或 `sha256`。Electron 保存端重新校验同一 artifact 的每跳 URL，并在流式核对实际字节数与 SHA-256 成功后才 `fsync` 并原子替换目标文件。Web 端在 25 MiB 上限内读取 PDF，核对媒体类型、内容编码、实际大小与 SHA-256 后才通过一次性 Blob URL 启动下载。浏览器仍无法观察之后的文件系统写入，因此只报告已启动，不宣称已保存。后端仍必须返回正确的 `Content-Type`、`X-Content-Type-Options: nosniff`，并在生产启用前冻结 Bearer 与 CORS 传播。

Sandboxed iframe 只隔离预览内容，不能为导航显式选择 Fetch credential mode，也不构成 Bearer 身份实现。因此预览数据通道仍属于身份方案的准入项；当前 iframe/CSP smoke 只证明 origin 与嵌入边界，不证明受保护 artifact 已完成认证。

这些输入冻结后才能实现生产 token supplier 与跨源下载策略；两种宿主不能共用一套假定的浏览器身份实现。

## 被否决的替代方案

- API 失败时退回 in-memory 数据：会把故障伪装成产品事实。
- 在 build-time 环境变量中放静态 Bearer token：会把凭据发布给 renderer，且没有用户生命周期。
- 为未来身份先增加永远返回空值的 provider：没有生产来源，只形成无意义抽象。
- 接受后端返回的任意 HTTPS `download_url`：会把 Electron main 变成 SSRF 与任意文件下载代理。
- 解析 Problem Details 的自然语言 `detail` 决定重试：文案不是稳定机器协议，也可能泄漏敏感上下文。
- 立即生成全量 REST fuzz tests：当前缺少统一 OpenAPI、认证测试身份和隔离写环境，测试预言不可靠。

## 依据

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) 规定 `status` 与实际 HTTP 状态一致，consumer 不应解析 `detail` 获取机器语义。
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html) 要求保护 redirect flow、使用 PKCE 并限制 token 权限。
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html) 提供 protected resource 到 authorization server 的标准发现与校验边界。
- [RFC 8252: OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html) 要求 native app 使用外部 user-agent，并为桌面 loopback redirect 定义安全约束。
- [Pact: Contract Tests vs Functional Tests](https://docs.pact.io/consumer/contract_tests_not_functional_tests) 区分消息理解验证与 provider 功能测试。
- Li 等对 73 项研究的系统映射说明架构侵蚀（Architecture Erosion）同时损害结构、质量与演化，并需要技术门禁与组织知识共同治理：[Understanding Software Architecture Erosion](https://doi.org/10.1002/smr.2423)。
- RESTest 展示由完整 API specification 驱动约束测试与黑盒 fuzzing 的未来方向，但其前提是可执行规范和受控环境：[ISSTA 2021](https://doi.org/10.1145/3460319.3469082)。

## 结果

用户看到的资源、成功状态和错误说明都有明确权威来源；未知结果不会被包装成成功。在当前页面与应用实例生命周期内，同一用户意图会复用稳定命令身份，避免确认操作意外创建新的 Session 或 Render Job；renderer 重启后的恢复仍需要持久命令日志或 provider reconciliation，当前实现不作跨进程保证。未实现能力不会被包装成服务端数据。代价是身份、实时媒体、上传和跨源 artifact 在上游契约冻结前保持不可用，但这种不可用是可审计的真实状态，而不是演示数据留下的隐性分支。
