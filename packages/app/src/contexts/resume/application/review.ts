/** @file Resume 历史与建议审阅应用端口 / Resume history and proposal-review application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiWorkspaceJobAuthority } from '../../workspace-operations'
import type { UiResumeId } from '../domain/document'
import type {
  UiDecideResumeProposalCommand,
  UiResumeProposalAuthority,
  UiResumeProposalId,
  UiResumeProposalPage,
  UiResumeProposalPageRead,
  UiResumeProposalDecisionResult,
  UiResumeRevision,
  UiResumeRevisionPage,
  UiResumeRevisionPageRead,
  UiStartResumeRestoreInput
} from '../domain/review'

/** @brief Resume 历史、Proposal 审阅与恢复用例端口 / Use-case port for Resume history, Proposal review, and restore. */
export interface ResumeReviewPort {
  /**
   * @brief 读取一页不可变 Resume revision 摘要 / Read one page of immutable Resume revision summaries.
   * @param input 显式 Workspace、Resume、cursor、limit 与取消信号 / Explicit Workspace, Resume, cursor, limit, and cancellation signal.
   * @return 保持 cursor 终态封闭关系的 revision 页 / Revision page preserving the closed terminal cursor relation.
   */
  listResumeRevisionPage(input: UiResumeRevisionPageRead): Promise<UiResumeRevisionPage>

  /**
   * @brief 读取一个不可变 revision 的完整历史 SIR / Read the complete historical SIR of one immutable revision.
   * @param workspaceId 显式授权 Workspace / Explicitly authorized Workspace.
   * @param resumeId 所属 Resume / Owning Resume.
   * @param revision 正整数领域 revision / Positive domain revision.
   * @param signal 页面身份变化时的取消信号 / Cancellation signal for page-identity changes.
   * @return 完整且身份一致的历史 revision / Complete historical revision with matching identities.
   */
  getResumeRevision(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    revision: number,
    signal: AbortSignal
  ): Promise<UiResumeRevision>

  /**
   * @brief 读取一页 Resume Proposal / Read one page of Resume Proposals.
   * @param input 显式 Workspace、Resume、cursor、limit 与取消信号 / Explicit Workspace, Resume, cursor, limit, and cancellation signal.
   * @return 保持 cursor 终态封闭关系的 Proposal 页 / Proposal page preserving the closed terminal cursor relation.
   */
  listResumeProposalPage(input: UiResumeProposalPageRead): Promise<UiResumeProposalPage>

  /**
   * @brief 读取带强并发令牌的 Proposal 权威 / Read an authoritative Proposal carrying a strong concurrency token.
   * @param workspaceId 显式授权 Workspace / Explicitly authorized Workspace.
   * @param resumeId Proposal 目标 Resume / Resume targeted by the Proposal.
   * @param proposalId Proposal identity / Proposal identity.
   * @param signal 页面身份变化时的取消信号 / Cancellation signal for page-identity changes.
   * @return decision 可原样冻结的 Proposal 与强 ETag / Proposal and strong ETag that can be frozen verbatim for a decision.
   */
  getResumeProposal(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    proposalId: UiResumeProposalId,
    signal: AbortSignal
  ): Promise<UiResumeProposalAuthority>

  /**
   * @brief 原子提交一个已冻结的 Proposal decision / Atomically submit one frozen Proposal decision.
   * @param command Proposal 快照、强 ETag、decision 与稳定 command identity / Proposal snapshot, strong ETag, decision, and stable command identity.
   * @return 决策后的完整 Resume、应用 IDs 与冲突 / Complete post-decision Resume, applied IDs, and conflicts.
   * @note outcome unknown 后必须原样重放同一 command；实现不得重新读取或改写该意图。 / After an unknown outcome, the exact same command must be replayed; implementations must not re-read or rewrite the intent.
   */
  decideResumeProposal(
    command: UiDecideResumeProposalCommand
  ): Promise<UiResumeProposalDecisionResult>

  /**
   * @brief 为历史 revision 启动并发安全的恢复 Job / Start a concurrency-safe restore Job for a historical revision.
   * @param input 当前 Resume revision、强 ETag、源 revision 与稳定 command identity / Current Resume revision, strong ETag, source revision, and stable command identity.
   * @return 可由 Workspace Operations 继续观察的 Job 权威 / Job authority observable through Workspace Operations.
   */
  startResumeRestore(input: UiStartResumeRestoreInput): Promise<UiWorkspaceJobAuthority>
}
