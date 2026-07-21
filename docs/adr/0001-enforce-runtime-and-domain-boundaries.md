# ADR 0001：执行化前端运行时与领域边界

- 状态：Accepted
- 日期：2026-07-22

## 背景

仓库已有 `apps -> app -> platform` 的单向包图、Gateway 端口、Electron main/preload/renderer 分层和面向用户行为的页面测试。但这些意图没有成为失败条件：

- Node 脚本、Electron main/preload、纯函数和 React 页面统一运行在 jsdom；
- TypeScript 与 ESLint 同时向所有文件开放 DOM、Node 和 Vitest 能力；
- Workspace、Resume、Interview、Knowledge 的模型、端口、adapter 和测试按技术类型聚合；
- Electron renderer 使用完整 Mock 组合，缺少 preload 时还会静默降级为 Web；
- `@ai-job-workspace/app` 根入口同时导出生产 UI、HTTP、Mock 和测试数据。

这种状态允许新的越界依赖在测试通过的情况下进入生产，属于早期模块化退化（Modular Degradation）。

## 决策

### 1. 采用模块化单体和四个业务上下文

按 `CONTEXT.md` 中的 Workspace Experience、Resume Authoring、Interview Practice、Knowledge 组织纵向模块。App Shell、Host Runtime、Observability 作为支撑边界。

不采用微前端（Micro Frontends）。当前没有独立团队、独立部署或运行时组合需求，其治理和重复依赖成本没有对应收益。

### 2. 测试按真实运行时与信心层级隔离

Vitest Test Projects 使用互斥文件约定：

| Project   | 文件约定                            | 责任                                                                    |
| --------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `node`    | `*.node.test.ts`、`*.node.test.mjs` | 纯函数、端口契约、HTTP adapter、配置、main/preload 纯逻辑、Node scripts |
| `dom`     | `*.dom.test.tsx`、`*.dom.test.ts`   | React 页面、路由和用户工作流集成                                        |
| `browser` | `*.browser.test.tsx`                | Chromium 中对真实 focus、keyboard、事件与浏览器行为的少量关键验证       |

真实 Electron 是第四条独立 lane，不由 Browser Mode 或 jsdom 代替。页面集成测试继续围绕角色、可访问名称、导航与可见结果，不围绕 hook、组件实例或私有状态。

### 3. 宿主差异只能存在于组合根和 adapter

Web 与 Desktop 共享业务模型、用例、React UI 与可复用 HTTP adapter；各自拥有独立组合根。

- Web 从公开的 Vite 配置创建 Browser adapter。
- Electron main 校验公开 API origin 和诊断配置，renderer 只消费校验后的运行时信息。
- 真正的 OS 特权能力通过按用户意图命名的 typed preload API 与固定 IPC 通道实现。
- 禁止通用 `invoke(channel, payload)`、文件系统代理、HTTP 代理和任意外链打开。
- Desktop preload 缺失时启动失败，不得伪装成 Web。

共享 UI 不等于复制 Web；共享的是产品语义，分离的是权限、配置和生命周期。

### 4. 用持续架构适应度函数执行边界

质量门禁逐步执行以下布尔不变量：

- runtime-invalid imports = 0；
- domain -> UI/adapter/host edges = 0；
- presentation -> infrastructure edges = 0；
- cross-context deep imports = 0；
- context presentation 直接读取其它 context gateway 或不属于自身的命名查询 = 0；
- production dependency cycles = 0；
- 每个测试文件只匹配一个 Test Project；
- Desktop production composition 不装配 Mock；
- shared contract submodule 已初始化、revision 固定且无本地修改。

先执行明确的非法依赖，不使用文件行数或主观耦合评分阻塞 CI。

## 迁移策略

1. 先拆 Test Projects、测试文件和 lint runtime globals。
2. 建立上下文公开入口和依赖门禁。
3. 逐一迁移 Workspace、Resume、Interview、Knowledge 的模型、端口、presentation 与 adapter；迁完即删除旧路径，不保留兼容 barrel。
4. 消除页面对 `HttpProblemError` 等 transport 错误的识别，由 adapter 映射安全应用错误。
5. 收紧 package exports，Mock/fixture 只从测试入口发布。
6. 重构 Web/Electron 组合根并补齐真实 Desktop adapter。
7. 增加 Browser 与 Electron E2E，最后完善可分发安装包、fuses、签名和发布验证。

每个步骤必须保持用户可感知功能、样式和正式前后端契约不变，并形成可独立审阅和回退的提交。

## 被否决的替代方案

- 继续使用单一 jsdom，仅靠文件注释分类：不能发现运行时错误。
- 为每个 React 组件建立窄单元测试：会把测试绑定到实现细节，降低重构信心。
- 立即按上下文拆成独立部署的微前端：当前组织与部署条件不成立。
- 将所有 Electron 业务请求改成通用 IPC/fetch proxy：扩大特权面并重复 transport 机制。
- 引入 `common`、`utils`、`BaseGateway` 层：按技术名字聚合，不能隐藏稳定设计决策。
- 保留旧目录 re-export 以兼容内部 import：本分支允许同步迁移，兼容层只会延长双重架构。

## 依据

- [Vitest Test Projects](https://vitest.dev/guide/projects) 与 [Parallelism](https://vitest.dev/guide/parallelism) 定义多配置和文件级并行；Vitest 也明确警告非 Node 环境可能隐藏 Node 生产错误。
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles/) 要求测试尽量接近真实使用方式。
- Eric Evans 的 [DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf) 要求模型在明确的 Bounded Context 内保持一致，并让领域层独立于 UI 与基础设施。
- Parnas 的模块化准则主张按需要隐藏的设计决策拆分，而不是按执行步骤拆分：[On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623)。
- Electron 的 [Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)、[Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 与 [Security](https://www.electronjs.org/docs/latest/tutorial/security) 要求明确进程职责、窄 bridge、sandbox 和 sender 校验。
- 软件反射模型（Software Reflexion Model）为“预期架构对比源码依赖”的自动一致性检查提供了学术基础：[Murphy, Notkin & Sullivan, IEEE TSE 2001](https://doi.org/10.1109/32.917525)。

## 结果

短期成本是文件迁移、配置增加和部分测试重复装配。长期收益是越界依赖会在提交时失败，业务模块可以独立演化，Web/Electron 差异被限制在可审计的宿主边界内。
