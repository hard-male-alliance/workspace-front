/** @file Mock 待确认项 / Mock items pending backend confirmation. */

/**
 * @brief Mock 待确认项 / Mock item pending backend confirmation.
 * @note 这些项目刻意不扩写为正式 contract，避免前端在 v0.1.0 阶段伪造后端契约。
 */
export interface MockPendingContractItem {
  /** @brief 待确认项 ID / Pending-item ID. */
  readonly id: string
  /** @brief 所属领域 / Owning domain. */
  readonly domain: 'resume' | 'interview' | 'knowledge' | 'workspace'
  /** @brief 待确认的问题 / Question pending confirmation. */
  readonly question: string
  /** @brief v0.1.0 的临时处理方式 / Temporary v0.1.0 handling. */
  readonly mockHandling: string
}

/**
 * @brief 所有 Mock 待确认项 / All Mock pending contract items.
 * @note 仅用于开发文档与测试；页面不得将这些文本当作服务端错误或产品内容。
 */
export const MOCK_PENDING_CONTRACT_ITEMS: readonly MockPendingContractItem[] = [
  {
    id: 'resume-preview-artifact',
    domain: 'resume',
    question:
      'Render Job 轮询、PDF RenderArtifact 恢复与同源 content URL 已接入；Render SSE、取消接口、轮询建议与 PdfSourceMap 交互仍待冻结。',
    mockHandling:
      'Web 通过正式 Job/artifact 路由显示 PDF；尚未生成时使用语义预览，Electron 使用可取消的三段式 Mock Job。'
  },
  {
    id: 'resume-editor-mutations',
    domain: 'resume',
    question:
      'ResumeOperationBatch、If-Match 与幂等键已由 Web HTTP adapter 接入；整份 Resume 删除、正式创建 DTO 与离线重放队列仍未冻结。',
    mockHandling:
      '板块编辑、排序、板块删除和模板切换走正式 operation 路由；409/412 会锁定后续写入并要求重读权威 Resume，不自动覆盖或重放旧 revision。'
  },
  {
    id: 'resume-assistant-generation',
    domain: 'resume',
    question:
      'Proposal 列表与 decision 已接入；Proposal create 仍是明确的 Mock adapter，Agent Run、取消、SSE 与恢复语义尚未冻结。',
    mockHandling:
      'Web 明确展示待审批 Proposal，只有接受后才重读权威 Resume；不伪造 undo、Agent Run 或流事件。'
  },
  {
    id: 'interview-media-transport',
    domain: 'interview',
    question:
      '音频采集、语音转写、AI 回合流、结束指令、去重、顺序、重连、恢复窗口与服务端权威超时语义尚未冻结。',
    mockHandling:
      '使用 UiInterviewRuntimeModel 模拟只读转写、提交回答和 AI 控制结束；不采集音频，不建立 WebRTC、WebSocket 或 SSE 连接。'
  },
  {
    id: 'interview-session-lifecycle',
    domain: 'interview',
    question:
      '历史列表、配置读取、创建会话、放弃会话的 method、path、DTO、幂等、错误与身份边界尚未冻结。',
    mockHandling:
      '通过 InterviewGateway 返回确定性历史、配置和创建结果；页面不包含传输字段或可信身份头。'
  },
  {
    id: 'interview-report-job',
    domain: 'interview',
    question:
      '报告 Job 的轮询或流式进度、失败诊断、最终资源、评分上下限和 100 分归一化规则尚未接入。',
    mockHandling:
      '直接提供明确标注的 100 分制 Mock UiInterviewReport，用于总结页面布局验收，不宣称为正式评分。'
  },
  {
    id: 'knowledge-file-ingestion-transport',
    domain: 'knowledge',
    question:
      '当前 multipart 新建/版本上传路径与 202 { source, ingestion_job } 包装是临时路径级绑定；正式 UploadSession、上传响应、幂等重放与共享环境行为仍待冻结和 smoke 验证。',
    mockHandling:
      'Web 通过 KnowledgeGateway 的 HTTP adapter 调用当前直传端点并有界轮询，Electron 使用同一领域端口的可取消 Mock；冻结 UploadSession 后只替换 adapter，不重写页面。'
  },
  {
    id: 'knowledge-search-transport',
    domain: 'knowledge',
    question:
      '当前 POST /knowledge-searches 与临时 { items: [...] } 响应包装尚不是完整冻结的路径契约；分页、授权审计、错误集合和共享环境结果仍待确认。',
    mockHandling:
      'Web 在 HTTP adapter 内验证临时包装并映射为 UiKnowledgeSearchResult，Electron 返回确定性的来源关联 Mock；页面不依赖 transport DTO。'
  },
  {
    id: 'knowledge-write-policy',
    domain: 'knowledge',
    question: 'KnowledgeVisibilityPolicy 的 PATCH、审计解释与服务端 EffectiveAccess 计算尚未接入。',
    mockHandling: '仅允许本地 Mock 草稿预览，且明确以 default deny 语义为默认；不会发送 PATCH。'
  },
  {
    id: 'workspace-resume-navigation',
    domain: 'workspace',
    question: 'Workspace 首页投影仍来自 Mock；正式 Workspace/首页聚合 API 尚未冻结。',
    mockHandling:
      '首页与稳定 /resumes 入口组合真实 Resume 列表选择最近简历，不再生成或映射固定 Mock Resume ID。'
  }
]
