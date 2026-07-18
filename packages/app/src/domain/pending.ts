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
      '真实 PDF RenderArtifact、短期签名 URL 与 PdfSourceMap 的前端获取时机尚待服务端接入确认。',
    mockHandling: '使用无二进制内容的 UiResumePreviewModel 作为语义预览占位。'
  },
  {
    id: 'resume-editor-mutations',
    domain: 'resume',
    question: 'ResumeOperationBatch 的提交、If-Match/ETag 与离线重放队列尚未接入。',
    mockHandling: '编辑器仅让本地草稿驱动视觉预览，不伪造保存、冲突解决或网络请求。'
  },
  {
    id: 'resume-assistant-generation',
    domain: 'resume',
    question:
      '简历助手的消息提交、Agent Run 绑定、结构化变更结果、单步撤销、取消以及 SSE 事件与恢复语义尚未冻结。',
    mockHandling:
      '通过 ResumeGateway 返回确定性的结构化编辑器投影和变更标识；不定义 HTTP 路径、DTO、鉴权头或流事件格式。'
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
    id: 'knowledge-write-policy',
    domain: 'knowledge',
    question: 'KnowledgeVisibilityPolicy 的 PATCH、审计解释与服务端 EffectiveAccess 计算尚未接入。',
    mockHandling: '仅允许本地 Mock 草稿预览，且明确以 default deny 语义为默认；不会发送 PATCH。'
  }
]
