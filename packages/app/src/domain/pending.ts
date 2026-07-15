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
    id: 'interview-media-transport',
    domain: 'interview',
    question: 'RealtimeConnectionDescriptor、WebRTC 信令与媒体轨道协商尚未接入。',
    mockHandling: '使用 UiLiveInterviewModel 展示确定性的连接状态、字幕和数字人文案。'
  },
  {
    id: 'interview-report-job',
    domain: 'interview',
    question: '报告 Job 的轮询、SSE 进度和失败诊断尚未接入。',
    mockHandling: '直接提供完成态 UiInterviewReport，用于总结页面布局验收。'
  },
  {
    id: 'knowledge-write-policy',
    domain: 'knowledge',
    question: 'KnowledgeVisibilityPolicy 的 PATCH、审计解释与服务端 EffectiveAccess 计算尚未接入。',
    mockHandling: '仅允许本地 Mock 草稿预览，且明确以 default deny 语义为默认；不会发送 PATCH。'
  }
]
