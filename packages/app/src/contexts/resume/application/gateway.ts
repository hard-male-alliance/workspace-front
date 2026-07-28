/** @file Resume Authoring 应用端口 / Resume Authoring application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiWorkspaceJobAuthority } from '../../workspace-operations'
import type { UiResumeEditorModel, UiResumeId } from '../domain/document'
import type {
  UiResumeProposalAuthority,
  UiResumeProposalDecision,
  UiResumeProposalDecisionResult,
  UiResumeProposalId,
  UiResumeProposalStatus
} from '../domain/review'
import type {
  UiResumeSectionDeleteInput,
  UiResumeItemUpdateInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeSummaryPage,
  UiResumeSummaryPageRead,
  UiResumeTemplateStyleCommand,
  UiStartResumeRenderInput
} from '../domain/models'

/** @brief Resume 助手展示的一条服务端消息 / One server-backed Resume-assistant message. */
/** @brief 助手消息所引用 Proposal 的权威生命周期投影 / Authoritative lifecycle projection for a Proposal referenced by an assistant message. */
export interface UiResumeAssistantProposalState {
  readonly id: UiResumeProposalId
  readonly title: string
  readonly status: UiResumeProposalStatus
}

export interface UiResumeAssistantMessage {
  readonly id: string
  readonly author: 'assistant' | 'user' | 'system'
  readonly text: string
  /** @brief 本条回复实际引用的 Knowledge Source identities / Knowledge Source identities actually cited by this response. */
  readonly referenceSourceIds: readonly string[]
  /** @brief 由 Proposal 资源读取的结构化状态，不从自然语言推断 / Structured states read from Proposal resources, never inferred from prose. */
  readonly proposalStates: readonly UiResumeAssistantProposalState[]
}

/** @brief 可刷新恢复的 Resume 助手会话 / Refresh-recoverable Resume-assistant thread. */
export interface UiResumeAssistantThread {
  readonly conversationId: string
  readonly messages: readonly UiResumeAssistantMessage[]
  /** @brief Agent 等待用户决定的 Proposal；前端只负责展示和回传决定 / Proposal awaiting the user's decision. */
  readonly pendingProposal: UiResumeProposalAuthority | null
  /** @brief 刷新恢复到终态失败时的稳定错误码 / Stable error code for a terminal failure recovered after refresh. */
  readonly recoveryProblemCode: string | null
}

/** @brief 与消息读取解耦的精确 Agent 命令恢复结果 / Exact Agent-command recovery result decoupled from message reads. */
export interface UiResumeAssistantCommandRecovery {
  /** @brief 恢复后仍等待用户决定的 Proposal / Proposal still awaiting a user decision after recovery. */
  readonly pendingProposal: UiResumeProposalAuthority | null
  /** @brief 已恢复终态 Run 的稳定问题码 / Stable Problem code from a recovered terminal Run. */
  readonly recoveryProblemCode: string | null
}

/** @brief 已确认 Proposal 后可继续观察的 Agent Run 句柄 / Opaque Agent Run handle to observe after a Proposal decision commits. */
export interface UiResumeAssistantProposalContinuation {
  readonly runId: string
  readonly waitingOutputMessageId: string | null
}

/** @brief Proposal 决策写入已完成，续答尚未等待的结果 / Result after the Proposal decision commits but before its Agent continuation is observed. */
export interface UiResumeAssistantProposalDecisionResult {
  readonly decision: UiResumeProposalDecisionResult
  readonly continuation: UiResumeAssistantProposalContinuation
}

/** @brief Proposal 决策后的 Agent 续答终态 / Terminal outcome after observing a Proposal-decision Agent continuation. */
export interface UiResumeAssistantProposalContinuationResult {
  readonly thread: UiResumeAssistantThread
  readonly problemCode: string | null
}

/** @brief 绑定精确 Resume revision 的助手请求 / Assistant request bound to an exact Resume revision. */
export interface UiResumeAssistantRequest {
  readonly workspaceId: UiWorkspaceId
  readonly resumeId: UiResumeId
  readonly resumeRevision: number
  readonly resumeTitle: string
  readonly locale: string
  readonly signal?: AbortSignal
}

/** @brief 区分只读问答与显式修改的 Resume Agent 产品端口 / Resume Agent product port separating read-only questions from explicit edits. */
export interface ResumeAssistantGateway {
  load(input: UiResumeAssistantRequest): Promise<UiResumeAssistantThread>
  recoverCommand(input: UiResumeAssistantRequest): Promise<UiResumeAssistantCommandRecovery>
  ask(
    input: UiResumeAssistantRequest & { readonly question: string }
  ): Promise<UiResumeAssistantThread>
  decideProposal(
    input: UiResumeAssistantRequest & {
      readonly authority: UiResumeProposalAuthority
      readonly decision: UiResumeProposalDecision
    }
  ): Promise<UiResumeAssistantProposalDecisionResult>
  waitForProposalContinuation(
    input: UiResumeAssistantRequest & {
      readonly continuation: UiResumeAssistantProposalContinuation
    }
  ): Promise<UiResumeAssistantProposalContinuationResult>
}

/** @brief 简历与模板页面数据端口 / Resume and template page-data port. */
export interface ResumeGateway {
  /** @brief 真实 Conversation/Message/Run/Proposal 支持的助手 / Assistant backed by real Conversation, Message, Run, and Proposal resources. */
  readonly assistant: ResumeAssistantGateway
  /**
   * @brief 读取 Workspace 中的一页 ResumeSummary / Read one ResumeSummary page in a Workspace.
   * @param input 显式 Workspace、不透明 cursor、页大小与取消信号 / Explicit Workspace, opaque cursor, page size, and cancellation signal.
   * @return 保持 `hasMore` 与 `nextCursor` 封闭关系的摘要页 / Summary page preserving the closed `hasMore`/`nextCursor` relation.
   */
  listResumeSummariesPage(input: UiResumeSummaryPageRead): Promise<UiResumeSummaryPage>

  /**
   * @brief 获取三栏编辑器数据 / Get three-pane editor data.
   * @param workspaceId 授权路径所属 Workspace / Workspace owning the authorization path.
   * @param resumeId 简历 ID / Resume ID.
   * @param signal 资源身份变化或页面卸载时触发的取消信号 / Cancellation signal triggered when resource identity changes or the page unmounts.
   * @return 编辑器页面展示模型 / Editor-page display model.
   */
  getResumeEditor(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    signal: AbortSignal
  ): Promise<UiResumeEditorModel>

  /**
   * @brief 为精确 Resume revision 启动通用 Render Job / Start a generic Render Job for an exact Resume revision.
   * @param input 幂等 command、Workspace、Resume、revision、mode 与唯一 formats / Idempotent command, Workspace, Resume, revision, mode, and unique formats.
   * @return 已接受且可由 Workspace Operations 继续观察的 Job 权威 / Accepted Job authority observable through Workspace Operations.
   */
  startResumeRender(input: UiStartResumeRenderInput): Promise<UiWorkspaceJobAuthority>

  /**
   * @brief 提交用户对单个板块的编辑 / Submit a user-authored section edit.
   * @param input 板块编辑领域输入 / Section-edit domain input.
   * @return 最新编辑器投影 / Latest editor projection.
   */
  updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel>

  /** @brief 提交用户对规范化条目文本字段的编辑 / Submit a user-authored normalized item text-field edit. */
  updateResumeItem(input: UiResumeItemUpdateInput): Promise<UiResumeEditorModel>

  /** @brief 调整简历板块顺序 / Reorder resume sections. */
  reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel>

  /** @brief 删除简历板块 / Delete a resume section. */
  deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel>

  /**
   * @brief 原子选择模板并保存完整语义样式 / Atomically select a Template and save complete semantic style.
   * @param command 可冻结并原样确认重放的用户意图 / User-intent envelope that can be frozen and replayed verbatim for confirmation.
   * @param signal 当前调用生命周期的可选取消信号 / Optional cancellation signal for the current call lifecycle.
   * @return 新强 ETag 与完整 Resume 权威 / New strong ETag and complete Resume authority.
   */
  updateResumeTemplateAndStyle(
    command: UiResumeTemplateStyleCommand,
    signal?: AbortSignal
  ): Promise<UiResumeEditorModel>
}
