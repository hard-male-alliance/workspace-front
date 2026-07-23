/** @file Resume revision 历史与 Proposal 审阅产品页 / Product page for Resume revision history and Proposal review. */

import {
  ArrowLeft,
  Check,
  ChevronRight,
  GitCommitHorizontal,
  History,
  Layers3,
  Sparkles,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import {
  useAsyncResource,
  useResumeGateway,
  useResumeReview,
  useResumeRestoreProcess,
  useWorkspaceSession
} from '../../../app/AppData'
import type { ResumeRestoreTarget, StartResumeRestore } from '../../../app/AppProcesses'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId } from '../../../shared-kernel/command'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../shared-kernel/identity'
import { nextDeadlineTimerDelayMilliseconds } from '../../../shared-kernel/polling'
import { EmptyState, LoadingState } from '../../../ui'
import type { UiWorkspaceJobAuthority } from '../../workspace-operations'
import {
  getResumeCommandRetryAfterMilliseconds,
  getResumeConflictStatus,
  getResumeIdempotencyConflict,
  isResumeCommandDefinitivelyRejected,
  isResumeUnreplayableContractResponse
} from '../application/errors'
import type { ResumeGateway } from '../application/gateway'
import type { ResumeReviewPort } from '../application/review'
import type { UiResumeEditorModel, UiResumeId } from '../domain/document'
import {
  asUiResumeReviewPageLimit,
  groupUiResumeProposalOperations,
  type UiDecideResumeProposalCommand,
  type UiPendingResumeProposal,
  type UiResumeProposal,
  type UiResumeProposalAuthority,
  type UiResumeProposalDecision,
  type UiResumeProposalDecisionResult,
  type UiResumeProposalOperation,
  type UiResumeProposalOperationGroup,
  type UiResumeProposalPage,
  type UiResumeRevision,
  type UiResumeRevisionPage,
  type UiResumeRevisionSummary
} from '../domain/review'
import { ResumeSemanticPreview } from './ResumeSemanticPreview'

/** @brief Review 页固定请求大小 / Fixed page size for the Review page. */
const REVIEW_PAGE_LIMIT = asUiResumeReviewPageLimit(40)

/** @brief Review 页签 / Review-page tab. */
type ReviewTab = 'history' | 'proposals'

/** @brief 可取消详情资源状态 / Abortable detail-resource state. */
type DetailState<TValue> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: TValue }
  | { readonly status: 'error'; readonly error: unknown }

/** @brief 首屏资源权威 / First-screen resource authority. */
type ResumeReviewResources =
  | {
      /** @brief 当前没有可用 Workspace / No Workspace is currently available. */
      readonly kind: 'no-workspace'
    }
  | {
      /** @brief 已取得 Workspace-scoped 权威 / Workspace-scoped authority is available. */
      readonly kind: 'workspace'
      /** @brief 当前 Workspace / Current Workspace. */
      readonly workspaceId: UiWorkspaceId
      /** @brief 当前 Workspace 展示名 / Current Workspace display name. */
      readonly workspaceName: string
      /** @brief 当前可变 Resume 权威 / Current mutable Resume authority. */
      readonly editor: UiResumeEditorModel
      /** @brief Revision 历史首页 / First revision-history page. */
      readonly revisions: UiResumeRevisionPage
      /** @brief Proposal 首页 / First Proposal page. */
      readonly proposals: UiResumeProposalPage
    }

/** @brief 后续页加载状态 / Continuation-page loading state. */
type ContinuationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown }

/** @brief 已冻结且等待确认或结果恢复的 decision / Frozen decision awaiting confirmation or outcome recovery. */
interface ProposalDecisionAttempt {
  /** @brief 完整且可原样重放的 command / Complete command safe for verbatim replay. */
  readonly command: UiDecideResumeProposalCommand
  /** @brief 面向用户的动作类别 / User-facing action kind. */
  readonly kind: UiResumeProposalDecision['kind']
}

/** @brief 不含调用生命周期 signal 的冻结 restore 意图 / Frozen restore intent without a call-lifecycle signal. */
interface ResumeRestoreAttempt {
  /** @brief 可在每次确认时附加新 signal 的稳定输入 / Stable input that receives a fresh signal on every confirmation. */
  readonly input: Omit<StartResumeRestore, 'signal'>
}

/**
 * @brief 格式化契约时间戳 / Format a contract timestamp.
 * @param timestamp ISO timestamp / ISO timestamp.
 * @param locale 当前界面语言 / Current UI locale.
 * @return 本地日期时间 / Localized date and time.
 */
function formatReviewTimestamp(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

/**
 * @brief 合并 revision 页且按领域 revision 去重 / Merge revision pages and deduplicate by domain revision.
 * @param current 已显示条目 / Currently displayed items.
 * @param incoming 新页条目 / Incoming page items.
 * @return 保持首次出现顺序的新集合 / New collection preserving first-seen order.
 */
function mergeRevisionSummaries(
  current: readonly UiResumeRevisionSummary[],
  incoming: readonly UiResumeRevisionSummary[]
): readonly UiResumeRevisionSummary[] {
  /** @brief revision 到摘要的稳定索引 / Stable index from revision to summary. */
  const byRevision = new Map(current.map((item) => [item.revision, item]))
  for (const item of incoming) byRevision.set(item.revision, item)
  return [...byRevision.values()]
}

/**
 * @brief 合并 Proposal 页且用较新投影替换同 ID 旧投影 / Merge Proposal pages and replace older projections sharing an ID.
 * @param current 已显示条目 / Currently displayed items.
 * @param incoming 新页条目 / Incoming page items.
 * @return 保持首次出现顺序的新集合 / New collection preserving first-seen order.
 */
function mergeProposals(
  current: readonly UiResumeProposal[],
  incoming: readonly UiResumeProposal[]
): readonly UiResumeProposal[] {
  /** @brief Proposal ID 到投影的稳定索引 / Stable index from Proposal ID to projection. */
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()]
}

/**
 * @brief 将未知 JSON 值限制为适合审阅列表的纯文本预览 / Bound an unknown JSON value to a plain-text review preview.
 * @param value 严格 JSON 值 / Strict JSON value.
 * @return 不超过约 160 code points 的安全文本 / Safe text of roughly at most 160 code points.
 */
function previewJsonValue(value: unknown): string {
  /** @brief JSON 序列化文本 / JSON-serialized text. */
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return '—'
  /** @brief Unicode code points / Unicode code points. */
  const points = [...serialized]
  return points.length <= 160 ? serialized : `${points.slice(0, 157).join('')}…`
}

/**
 * @brief 为一个 Proposal operation 生成产品摘要 / Build a product summary for one Proposal operation.
 * @param operation 完整语义 operation / Complete semantic operation.
 * @return 标题与不执行 HTML 的纯文本详情 / Title and plain-text detail without HTML execution.
 */
function describeProposalOperation(
  operation: UiResumeProposalOperation,
  t: ReturnType<typeof useTranslation>['t']
): {
  readonly title: string
  readonly detail: string
} {
  /** @brief 面向用户的实体种类 / User-facing entity kind. */
  const entityKind = (kind: 'item' | 'section'): string =>
    kind === 'item'
      ? t('resume.review.operation.item', { defaultValue: '条目' })
      : t('resume.review.operation.section', { defaultValue: '板块' })
  switch (operation.kind) {
    case 'set-field':
      return {
        detail: `${operation.fieldPath.join(' › ')} → ${previewJsonValue(operation.value)}`,
        title: t('resume.review.operation.setField', { defaultValue: '修改字段' })
      }
    case 'upsert-section':
      return {
        detail: operation.section.title || operation.section.kind,
        title: t('resume.review.operation.upsertSection', {
          defaultValue: '新增或更新板块'
        })
      }
    case 'upsert-item':
      return {
        detail: operation.item.title ?? operation.item.kind,
        title: t('resume.review.operation.upsertItem', {
          defaultValue: '新增或更新条目'
        })
      }
    case 'remove-entity':
      return {
        detail: `${entityKind(operation.entityKind)} · ${operation.entityId}`,
        title: t('resume.review.operation.removeEntity', { defaultValue: '删除内容' })
      }
    case 'move-entity':
      return {
        detail: `${entityKind(operation.entityKind)} · ${operation.entityId}`,
        title: t('resume.review.operation.moveEntity', { defaultValue: '调整顺序' })
      }
    case 'set-template':
      return {
        detail: `${operation.template.templateId} · v${operation.template.templateVersion}`,
        title: t('resume.review.operation.setTemplate', { defaultValue: '更换模板' })
      }
  }
}

/**
 * @brief Proposal 状态对应的本地化标签 / Localized label for a Proposal status.
 * @param status Proposal 状态 / Proposal status.
 * @param t 翻译函数 / Translation function.
 * @return 面向用户的状态标签 / User-facing status label.
 */
function proposalStatusLabel(
  status: UiResumeProposal['status'],
  t: ReturnType<typeof useTranslation>['t']
): string {
  switch (status) {
    case 'pending':
      return t('resume.review.status.pending', { defaultValue: '待审阅' })
    case 'accepted':
      return t('resume.review.status.accepted', { defaultValue: '已全部接受' })
    case 'partially-accepted':
      return t('resume.review.status.partiallyAccepted', { defaultValue: '已部分接受' })
    case 'rejected':
      return t('resume.review.status.rejected', { defaultValue: '已拒绝' })
    case 'expired':
      return t('resume.review.status.expired', { defaultValue: '已过期' })
  }
}

/** @brief Review 工作区属性 / Review-workspace properties. */
interface ResumeReviewWorkspaceProps {
  /** @brief 当前可变 Resume 端口 / Current mutable Resume port. */
  readonly resume: ResumeGateway
  /** @brief 历史与 Proposal 审阅端口 / History and Proposal-review port. */
  readonly review: ResumeReviewPort
  /** @brief 首屏权威资源 / First-screen authoritative resources. */
  readonly resources: Extract<ResumeReviewResources, { readonly kind: 'workspace' }>
  /** @brief 当前 Resume / Current Resume. */
  readonly resumeId: UiResumeId
  /** @brief 当前页签 / Current tab. */
  readonly tab: ReviewTab
  /** @brief 更新 URL 中的页签 / Update the tab in the URL. */
  readonly onTabChange: (tab: ReviewTab) => void
}

/** @brief 历史恢复控件属性 / Historical-restore control properties. */
interface ResumeRestoreControlsProps {
  /** @brief 当前可变 Resume 权威 / Current mutable Resume authority. */
  readonly currentEditor: UiResumeEditorModel
  /** @brief 当前只读历史 revision / Current read-only historical revision. */
  readonly revision: UiResumeRevision
  /** @brief 已冻结 restore 意图 / Frozen restore intent. */
  readonly attempt: ResumeRestoreAttempt | null
  /** @brief 已取得 identity 的 Job 权威 / Known Job authority with a stable identity. */
  readonly jobAuthority: UiWorkspaceJobAuthority | null
  /** @brief restore 流程错误 / Restore-process error. */
  readonly error: unknown
  /** @brief 是否正在启动、观察或重读 / Whether start, observation, or reread is active. */
  readonly isRestoring: boolean
  /** @brief 是否正在确认取消命令 / Whether a cancellation command is being confirmed. */
  readonly isCancelling: boolean
  /** @brief Retry-After 是否暂时阻止确认 / Whether Retry-After temporarily blocks confirmation. */
  readonly confirmationBlocked: boolean
  /** @brief 已确认恢复后的新 Resume revision / New Resume revision after confirmed restore. */
  readonly restoredRevision: number | null
  /** @brief 准备二次确认 / Prepare the confirmation. */
  readonly onPrepare: (revision: number) => void
  /** @brief 提交或继续同一恢复流程 / Submit or continue the same restore process. */
  readonly onConfirm: () => void
  /** @brief 取消已知且仍运行的 Job / Cancel a known running Job. */
  readonly onCancelJob: () => void
  /** @brief 放弃旧命令并重读当前 Resume / Abandon the old command and reread the current Resume. */
  readonly onAbandonAndReload: () => void
  /** @brief 尚未发送时撤销确认 / Dismiss an unsent confirmation. */
  readonly onDismiss: () => void
}

/**
 * @brief 呈现一次并发安全、可恢复的历史恢复流程 / Render one concurrency-safe, recoverable historical-restore process.
 * @param props 当前 revision、冻结命令、Job 与恢复动作 / Current revision, frozen command, Job, and recovery actions.
 * @return 不把 202 冒充已恢复的 Job 驱动界面 / Job-driven UI that never presents 202 as a completed restore.
 */
function ResumeRestoreControls(props: ResumeRestoreControlsProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前错误的安全分类 / Safe classification of the current error. */
  const failure = props.error === null ? null : classifyResourceFailure(props.error)
  /** @brief 当前幂等冲突 / Current idempotency conflict. */
  const idempotencyConflict = getResumeIdempotencyConflict(props.error)
  /** @brief 是否必须原样确认同一 restore command / Whether the exact same restore command must be confirmed. */
  const mustConfirmSameRestore =
    props.attempt !== null &&
    props.jobAuthority === null &&
    !isResumeUnreplayableContractResponse(props.error) &&
    (failure?.kind === 'outcome-unknown' || idempotencyConflict === 'in-progress')
  /** @brief 已知 Job 是否仍可取消 / Whether the known Job can still be cancelled. */
  const jobPending =
    props.jobAuthority?.job.status === 'queued' || props.jobAuthority?.job.status === 'running'
  /** @brief 当前按钮是否能安全地继续；未知 Job 时只允许首次发送或原样确认 / Whether continuing is safe; without a known Job only an initial send or exact confirmation is allowed. */
  const canConfirmRestore =
    props.restoredRevision === null &&
    (props.jobAuthority === null
      ? props.error === null || mustConfirmSameRestore
      : jobPending || props.error !== null)
  /** @brief 面向用户的 Job 状态 / User-facing Job status. */
  const jobStatus =
    props.jobAuthority === null
      ? null
      : props.jobAuthority.job.status === 'queued'
        ? t('resume.review.restoreQueued', { defaultValue: '恢复任务正在排队。' })
        : props.jobAuthority.job.status === 'running'
          ? t('resume.review.restoreRunning', { defaultValue: '正在创建新的当前版本。' })
          : props.jobAuthority.job.status === 'succeeded'
            ? t('resume.review.restoreJobSucceeded', {
                defaultValue: '任务已成功，正在重新读取当前 Resume。'
              })
            : props.jobAuthority.job.status === 'failed'
              ? t('resume.review.restoreFailed', {
                  defaultValue: '恢复失败。参考编号：{{referenceId}}',
                  referenceId: props.jobAuthority.job.problem.requestId
                })
              : props.jobAuthority.job.status === 'cancelled'
                ? t('resume.review.restoreCancelled', { defaultValue: '恢复任务已取消。' })
                : t('resume.review.restoreExpired', { defaultValue: '恢复任务已过期。' })

  if (props.revision.revision === props.currentEditor.resume.revision) {
    return (
      <p className="aw-muted-copy">
        {t('resume.review.restoreCurrentNotice', {
          defaultValue: '这是当前版本，无需恢复。'
        })}
      </p>
    )
  }

  return (
    <section className="aw-review-restore">
      <div>
        <strong>{t('resume.review.restoreTitle', { defaultValue: '恢复此版本' })}</strong>
        <p>
          {t('resume.review.restoreDescription', {
            defaultValue:
              '恢复不会改写历史快照；服务端会异步创建一个新的当前版本，并保留完整版本链。'
          })}
        </p>
      </div>
      {props.attempt === null ? (
        <button
          className="aw-quiet-button"
          onClick={(): void => props.onPrepare(props.revision.revision)}
          type="button"
        >
          {t('resume.review.prepareRestore', {
            defaultValue: '恢复到版本 {{revision}}',
            revision: props.revision.revision
          })}
        </button>
      ) : (
        <div className="aw-review-confirmation">
          <strong>
            {mustConfirmSameRestore
              ? t('resume.review.confirmSameRestoreTitle', {
                  defaultValue: '结果尚未确认，必须原样确认同一恢复命令'
                })
              : props.jobAuthority === null
                ? t('resume.review.confirmRestoreTitle', {
                    defaultValue: '确认从版本 {{revision}} 创建新的当前版本？',
                    revision: props.attempt.input.sourceRevision
                  })
                : t('resume.review.restoreInProgressTitle', {
                    defaultValue: '恢复任务已获得服务端身份'
                  })}
          </strong>
          <p>
            {t('resume.review.restoreConcurrencyNotice', {
              defaultValue:
                '命令绑定当前 Resume 版本 {{revision}} 和强 ETag；如果内容已变化，服务器会拒绝而不是覆盖。',
              revision: props.attempt.input.currentRevision
            })}
          </p>
          {mustConfirmSameRestore ? (
            <p className="aw-review-warning">
              {t('resume.review.restoreUnknownAbandonNotice', {
                defaultValue:
                  '你也可以放弃本地跟踪并重读当前 Resume；这不会撤销服务器可能已经接受的任务。'
              })}
            </p>
          ) : null}
          {jobStatus === null ? null : (
            <p
              aria-live="polite"
              role={props.jobAuthority?.job.status === 'failed' ? 'alert' : 'status'}
            >
              {jobStatus}
            </p>
          )}
          {props.error !== null ? (
            <p role="alert">
              <ResourceFailureMessage error={props.error} />
            </p>
          ) : null}
          {props.restoredRevision !== null ? (
            <p className="aw-success-note" role="status">
              {t('resume.review.restoreSucceeded', {
                defaultValue: '恢复已确认；新的当前 Resume 是版本 {{revision}}。',
                revision: props.restoredRevision
              })}
            </p>
          ) : null}
          <div className="aw-inline-actions">
            {canConfirmRestore ? (
              <button
                className="aw-primary-button"
                disabled={props.isRestoring || props.confirmationBlocked}
                onClick={props.onConfirm}
                type="button"
              >
                {props.isRestoring
                  ? t('resume.review.restoring', { defaultValue: '正在处理恢复…' })
                  : props.confirmationBlocked
                    ? t('resume.review.restoreRetryWaiting', {
                        defaultValue: '等待服务端允许确认…'
                      })
                    : props.jobAuthority !== null
                      ? t('resume.review.continueRestore', { defaultValue: '继续查询恢复任务' })
                      : mustConfirmSameRestore
                        ? t('resume.review.confirmSameRestore', {
                            defaultValue: '确认同一恢复结果'
                          })
                        : t('resume.review.confirmRestore', { defaultValue: '确认恢复' })}
              </button>
            ) : null}
            {jobPending ? (
              <button
                className="aw-danger-button"
                disabled={props.isCancelling}
                onClick={props.onCancelJob}
                type="button"
              >
                {props.isCancelling
                  ? t('resume.review.cancellingRestore', { defaultValue: '正在取消恢复任务…' })
                  : t('resume.review.cancelRestore', { defaultValue: '取消恢复任务' })}
              </button>
            ) : null}
            {props.jobAuthority === null && props.error === null ? (
              <button className="aw-quiet-button" onClick={props.onDismiss} type="button">
                {t('common.cancel', { defaultValue: '取消' })}
              </button>
            ) : null}
            {props.jobAuthority === null && props.error !== null ? (
              <button className="aw-quiet-button" onClick={props.onAbandonAndReload} type="button">
                {t('resume.review.abandonRestore', {
                  defaultValue: '放弃旧命令并重读当前 Resume'
                })}
              </button>
            ) : null}
            {props.restoredRevision !== null ||
            (props.jobAuthority !== null && !jobPending && props.error === null) ? (
              <button className="aw-quiet-button" onClick={props.onDismiss} type="button">
                {props.restoredRevision !== null
                  ? t('common.done', { defaultValue: '完成' })
                  : t('common.close', { defaultValue: '关闭' })}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * @brief 呈现 revision 时间线 / Render the revision timeline.
 * @param props 端口、身份与当前权威 / Port, identities, and current authority.
 * @return 可渐进加载且不猜测排序的 revision 审阅界面 / Incrementally loaded revision review UI that does not infer ordering.
 */
function ResumeHistoryPanel({
  currentEditor,
  items,
  onLoadMore,
  onSelect,
  page,
  restoreControls,
  selected,
  continuation
}: {
  readonly currentEditor: UiResumeEditorModel
  readonly items: readonly UiResumeRevisionSummary[]
  readonly page: UiResumeRevisionPage
  readonly selected: DetailState<UiResumeRevision>
  readonly continuation: ContinuationState
  readonly restoreControls: Omit<ResumeRestoreControlsProps, 'currentEditor' | 'revision'>
  readonly onLoadMore: () => void
  readonly onSelect: (revision: number) => void
}): React.JSX.Element {
  /** @brief 翻译与当前应用语言 / Translation and current application locale. */
  const { i18n, t } = useTranslation()
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        description={t('resume.review.historyEmptyDescription', {
          defaultValue: '服务端尚未返回任何不可变版本。'
        })}
        title={t('resume.review.historyEmptyTitle', { defaultValue: '暂无版本历史' })}
        visual={<History aria-hidden="true" />}
      />
    )
  }

  return (
    <div className="aw-resume-review-layout">
      <section aria-label={t('resume.review.historyList', { defaultValue: '版本时间线' })}>
        <p className="aw-muted-copy">
          {t('resume.review.orderNotice', {
            defaultValue: '版本按服务端顺序显示；当前版本会单独标记。'
          })}
        </p>
        <ol className="aw-review-timeline">
          {items.map((item) => (
            <li key={item.revision}>
              <button
                className="aw-review-list-button"
                disabled={
                  restoreControls.attempt !== null &&
                  selected.status === 'ready' &&
                  item.revision !== selected.value.revision
                }
                onClick={(): void => onSelect(item.revision)}
                type="button"
              >
                <span>
                  <strong>
                    {t('resume.revision', {
                      defaultValue: '版本 {{revision}}',
                      revision: item.revision
                    })}
                  </strong>
                  {item.revision === currentEditor.resume.revision ? (
                    <span className="aw-review-status" data-status="current">
                      {t('resume.review.current', { defaultValue: '当前版本' })}
                    </span>
                  ) : null}
                  <small>
                    <time dateTime={item.createdAt}>
                      {formatReviewTimestamp(item.createdAt, i18n.language)}
                    </time>
                  </small>
                </span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </li>
          ))}
        </ol>
        {page.hasMore ? (
          <div className="aw-inline-actions">
            <button
              className="aw-quiet-button"
              disabled={continuation.status === 'loading'}
              onClick={onLoadMore}
              type="button"
            >
              {continuation.status === 'loading'
                ? t('resume.review.loadingMoreHistory', { defaultValue: '正在加载更多版本…' })
                : t('resume.review.loadMoreHistory', { defaultValue: '加载更多版本' })}
            </button>
          </div>
        ) : (
          <p className="aw-muted-copy">
            {t('resume.review.historyEnd', { defaultValue: '已显示全部版本。' })}
          </p>
        )}
        {continuation.status === 'error' ? (
          <p role="alert">
            <ResourceFailureMessage error={continuation.error} />
          </p>
        ) : null}
      </section>

      <section className="aw-review-detail" aria-live="polite">
        {selected.status === 'idle' ? (
          <EmptyState
            compact
            description={t('resume.review.selectRevisionDescription', {
              defaultValue: '选择一个版本查看其完整只读语义内容。'
            })}
            title={t('resume.review.selectRevision', { defaultValue: '选择版本' })}
            visual={<GitCommitHorizontal aria-hidden="true" />}
          />
        ) : selected.status === 'loading' ? (
          <LoadingState
            label={t('resume.review.loadingRevision', { defaultValue: '正在加载完整版本…' })}
          />
        ) : selected.status === 'error' ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('resume.review.revisionError', { defaultValue: '无法加载这个版本' })}
            </strong>
            <p>
              <ResourceFailureMessage error={selected.error} />
            </p>
          </div>
        ) : (
          <>
            <div className="aw-review-detail-heading">
              <div>
                <span className="aw-eyebrow">
                  {t('resume.review.immutableRevision', { defaultValue: '不可变历史快照' })}
                </span>
                <h2>
                  {t('resume.revision', {
                    defaultValue: '版本 {{revision}}',
                    revision: selected.value.revision
                  })}
                </h2>
              </div>
              {selected.value.revision === currentEditor.resume.revision ? (
                <span className="aw-review-status" data-status="current">
                  {t('resume.review.current', { defaultValue: '当前版本' })}
                </span>
              ) : null}
            </div>
            <p className="aw-muted-copy">
              {t('resume.review.revisionReadOnly', {
                defaultValue: '历史内容始终只读；恢复会创建新的当前版本，不会覆盖这份快照。'
              })}
            </p>
            <ResumeRestoreControls
              {...restoreControls}
              currentEditor={currentEditor}
              revision={selected.value}
            />
            <div className="aw-review-document">
              <ResumeSemanticPreview
                document={selected.value.document}
                label={t('resume.review.revisionPreview', {
                  defaultValue: '历史版本 {{revision}} 的语义预览',
                  revision: selected.value.revision
                })}
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/**
 * @brief 呈现一个不可拆分 Proposal operation 组 / Render one indivisible Proposal operation group.
 * @param props 分组、选择状态与动作 / Group, selection state, and action.
 * @return 以 operation ID 为最小选择单位的列表项 / List item using operation ID as the minimum selectable unit.
 */
function ProposalOperationGroup({
  disabled,
  group,
  onToggle,
  selected
}: {
  readonly disabled: boolean
  readonly group: UiResumeProposalOperationGroup
  readonly onToggle: (group: UiResumeProposalOperationGroup) => void
  readonly selected: boolean
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  return (
    <li className="aw-proposal-operation">
      <label>
        <input
          checked={selected}
          disabled={disabled}
          onChange={(): void => onToggle(group)}
          type="checkbox"
        />
        <span>
          {group.operations.map((operation, index) => {
            /** @brief 当前 operation 的产品摘要 / Product summary for the current operation. */
            const description = describeProposalOperation(operation, t)
            return (
              <span className="aw-proposal-operation-copy" key={`${group.operationId}:${index}`}>
                <strong>{description.title}</strong>
                <small>{description.detail}</small>
              </span>
            )
          })}
          {group.operations.length > 1 ? (
            <small className="aw-review-warning">
              {t('resume.review.duplicateOperationGroup', {
                count: group.operations.length,
                defaultValue:
                  '这 {{count}} 项共享同一个操作标识，API 只允许把它们作为一个整体接受或拒绝。'
              })}
            </small>
          ) : null}
        </span>
      </label>
    </li>
  )
}

/** @brief Proposal 面板属性 / Proposal-panel properties. */
interface ResumeProposalPanelProps {
  /** @brief 当前 Proposal 列表 / Current Proposal list. */
  readonly items: readonly UiResumeProposal[]
  /** @brief 当前列表页关系 / Current list-page relation. */
  readonly page: UiResumeProposalPage
  /** @brief 详情资源 / Detail resource. */
  readonly selected: DetailState<UiResumeProposalAuthority>
  /** @brief 后续页状态 / Continuation state. */
  readonly continuation: ContinuationState
  /** @brief 当前选择的 operation IDs / Currently selected operation IDs. */
  readonly selectedOperationIds: ReadonlySet<string>
  /** @brief 冻结 decision / Frozen decision. */
  readonly decisionAttempt: ProposalDecisionAttempt | null
  /** @brief decision 是否正在提交 / Whether a decision is submitting. */
  readonly isDeciding: boolean
  /** @brief Retry-After 是否暂时阻止原样确认 / Whether Retry-After temporarily blocks exact confirmation. */
  readonly decisionConfirmationBlocked: boolean
  /** @brief decision 失败 / Decision failure. */
  readonly decisionError: unknown
  /** @brief 最近已确认结果 / Latest confirmed result. */
  readonly decisionResult: UiResumeProposalDecisionResult | null
  /** @brief 已确认 decision 后权威列表或详情尚未同步 / Authoritative lists or detail not yet synchronized after a confirmed decision. */
  readonly decisionSyncError: unknown
  /** @brief 加载更多 / Load more. */
  readonly onLoadMore: () => void
  /** @brief 选择 Proposal / Select Proposal. */
  readonly onSelect: (proposal: UiResumeProposal) => void
  /** @brief 切换 operation ID 组 / Toggle one operation-ID group. */
  readonly onToggleOperation: (group: UiResumeProposalOperationGroup) => void
  /** @brief 准备 decision / Prepare a decision. */
  readonly onPrepareDecision: (decision: UiResumeProposalDecision) => void
  /** @brief 确认冻结 decision / Confirm the frozen decision. */
  readonly onConfirmDecision: () => void
  /** @brief 放弃未发送的 decision / Abandon an unsent decision. */
  readonly onAbandonDecision: () => void
  /** @brief 重读当前 Proposal / Reread the current Proposal. */
  readonly onReloadProposal: () => void
  /** @brief 重试已确认 decision 后的权威同步 / Retry authority synchronization after a confirmed decision. */
  readonly onRetryDecisionSync: () => void
}

/**
 * @brief 呈现 Proposal inbox 与原子 decision / Render the Proposal inbox and atomic decisions.
 * @param props Proposal 状态机与动作 / Proposal state machine and actions.
 * @return 不把 Agent 建议冒充已应用修改的审阅界面 / Review UI that never presents Agent suggestions as applied changes.
 */
function ResumeProposalPanel(props: ResumeProposalPanelProps): React.JSX.Element {
  /** @brief 翻译与当前语言 / Translation and current locale. */
  const { i18n, t } = useTranslation()
  /** @brief 当前详情 Proposal / Current detailed Proposal. */
  const authority = props.selected.status === 'ready' ? props.selected.value : null
  /** @brief operation ID 分组 / Operation-ID groups. */
  const groups = useMemo(
    () =>
      authority === null ? [] : groupUiResumeProposalOperations(authority.proposal.operations),
    [authority]
  )
  /** @brief 选中组数 / Count of selected groups. */
  const selectedCount = groups.filter((group) =>
    props.selectedOperationIds.has(group.operationId)
  ).length
  /** @brief 是否必须原样确认同一 decision / Whether the exact decision must be confirmed verbatim. */
  const decisionFailure =
    props.decisionError === null ? null : classifyResourceFailure(props.decisionError)
  /** @brief 服务端幂等冲突类别 / Server idempotency-conflict category. */
  const idempotencyConflict = getResumeIdempotencyConflict(props.decisionError)
  /** @brief 当前失败是否允许且要求重放冻结 command / Whether the failure permits and requires replaying the frozen command. */
  const mustConfirmSameDecision =
    props.decisionAttempt !== null &&
    !isResumeUnreplayableContractResponse(props.decisionError) &&
    (decisionFailure?.kind === 'outcome-unknown' || idempotencyConflict === 'in-progress')
  /** @brief 已收到确定拒绝或不可重放响应时禁止再次发送旧信封 / Prevent resending an old envelope after a definitive rejection or unreplayable response. */
  const decisionCannotReplay =
    props.decisionError !== null &&
    !mustConfirmSameDecision &&
    (isResumeUnreplayableContractResponse(props.decisionError) ||
      idempotencyConflict === 'key-reused' ||
      getResumeConflictStatus(props.decisionError) !== null ||
      isResumeCommandDefinitivelyRejected(props.decisionError))

  if (props.items.length === 0) {
    return (
      <EmptyState
        compact
        description={t('resume.review.proposalEmptyDescription', {
          defaultValue: 'Agent 生成建议后会出现在这里；建议不会自动改写简历。'
        })}
        title={t('resume.review.proposalEmptyTitle', { defaultValue: '没有待审阅建议' })}
        visual={<Sparkles aria-hidden="true" />}
      />
    )
  }

  return (
    <div className="aw-resume-review-layout">
      <section aria-label={t('resume.review.proposalList', { defaultValue: '建议列表' })}>
        <p className="aw-muted-copy">
          {t('resume.review.proposalSafety', {
            defaultValue: '建议只是候选修改；只有你明确确认后才会原子应用。'
          })}
        </p>
        <ul className="aw-review-proposal-list">
          {props.items.map((proposal) => (
            <li key={proposal.id}>
              <button
                className="aw-review-list-button"
                disabled={props.isDeciding}
                onClick={(): void => props.onSelect(proposal)}
                type="button"
              >
                <span>
                  <strong>{proposal.title}</strong>
                  <small>
                    {t('resume.review.basedOnRevision', {
                      defaultValue: '基于版本 {{revision}}',
                      revision: proposal.baseRevision
                    })}
                    {' · '}
                    {formatReviewTimestamp(proposal.updatedAt, i18n.language)}
                  </small>
                  <span className="aw-review-status" data-status={proposal.status}>
                    {proposalStatusLabel(proposal.status, t)}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </li>
          ))}
        </ul>
        {props.page.hasMore ? (
          <button
            className="aw-quiet-button"
            disabled={props.continuation.status === 'loading'}
            onClick={props.onLoadMore}
            type="button"
          >
            {props.continuation.status === 'loading'
              ? t('resume.review.loadingMoreProposals', { defaultValue: '正在加载更多建议…' })
              : t('resume.review.loadMoreProposals', { defaultValue: '加载更多建议' })}
          </button>
        ) : (
          <p className="aw-muted-copy">
            {t('resume.review.proposalEnd', { defaultValue: '已显示全部建议。' })}
          </p>
        )}
        {props.continuation.status === 'error' ? (
          <p role="alert">
            <ResourceFailureMessage error={props.continuation.error} />
          </p>
        ) : null}
      </section>

      <section className="aw-review-detail" aria-live="polite">
        {props.selected.status === 'idle' ? (
          <EmptyState
            compact
            description={t('resume.review.selectProposalDescription', {
              defaultValue: '打开建议后会再次读取最新状态和强并发校验器。'
            })}
            title={t('resume.review.selectProposal', { defaultValue: '选择一条建议' })}
            visual={<Layers3 aria-hidden="true" />}
          />
        ) : props.selected.status === 'loading' ? (
          <LoadingState
            label={t('resume.review.loadingProposal', { defaultValue: '正在读取最新建议…' })}
          />
        ) : props.selected.status === 'error' ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('resume.review.proposalError', { defaultValue: '无法加载这条建议' })}
            </strong>
            <p>
              <ResourceFailureMessage error={props.selected.error} />
            </p>
            <button className="aw-quiet-button" onClick={props.onReloadProposal} type="button">
              {t('common.retry', { defaultValue: '重试' })}
            </button>
          </div>
        ) : authority === null ? null : (
          <>
            <div className="aw-review-detail-heading">
              <div>
                <span className="aw-eyebrow">
                  {t('resume.review.agentProposal', { defaultValue: 'Agent 建议' })}
                </span>
                <h2>{authority.proposal.title}</h2>
              </div>
              <span className="aw-review-status" data-status={authority.proposal.status}>
                {proposalStatusLabel(authority.proposal.status, t)}
              </span>
            </div>
            <p className="aw-muted-copy">
              {t('resume.review.proposalMetadata', {
                defaultValue: '基于 Resume 版本 {{base}} · 建议资源版本 {{proposal}}',
                base: authority.proposal.baseRevision,
                proposal: authority.proposal.revision
              })}
            </p>
            <fieldset
              className="aw-proposal-fieldset"
              disabled={
                authority.proposal.status !== 'pending' ||
                props.isDeciding ||
                props.decisionAttempt !== null ||
                props.decisionResult !== null
              }
            >
              <legend>
                {t('resume.review.proposedChanges', {
                  count: groups.length,
                  defaultValue: '建议修改（{{count}} 个可决策组）'
                })}
              </legend>
              <ul className="aw-proposal-operation-list">
                {groups.map((group) => (
                  <ProposalOperationGroup
                    disabled={authority.proposal.status !== 'pending'}
                    group={group}
                    key={group.operationId}
                    onToggle={props.onToggleOperation}
                    selected={props.selectedOperationIds.has(group.operationId)}
                  />
                ))}
              </ul>
            </fieldset>

            {authority.proposal.evidenceRefs.length > 0 ? (
              <details className="aw-review-evidence">
                <summary>
                  {t('resume.review.evidence', {
                    count: authority.proposal.evidenceRefs.length,
                    defaultValue: '证据引用（{{count}}）'
                  })}
                </summary>
                <ul>
                  {authority.proposal.evidenceRefs.map((reference, index) => (
                    <li key={`${reference.resourceType}:${reference.id}:${index}`}>
                      <code>{reference.resourceType}</code> · {reference.id}
                      {reference.revision === undefined
                        ? ''
                        : ` · ${t('resume.review.evidenceRevision', {
                            defaultValue: '版本 {{revision}}',
                            revision: reference.revision ?? '—'
                          })}`}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {authority.proposal.status === 'pending' &&
            props.decisionAttempt === null &&
            props.decisionResult === null ? (
              <div className="aw-review-decision-actions">
                <button
                  className="aw-primary-button"
                  onClick={(): void => props.onPrepareDecision({ kind: 'accept-all' })}
                  type="button"
                >
                  <Check aria-hidden="true" size={17} />
                  {t('resume.review.acceptAll', { defaultValue: '接受全部' })}
                </button>
                <button
                  className="aw-quiet-button"
                  disabled={selectedCount === 0}
                  onClick={(): void =>
                    props.onPrepareDecision({
                      kind: 'accept-selected',
                      operationIds: groups
                        .filter((group) => props.selectedOperationIds.has(group.operationId))
                        .map((group) => group.operationId)
                    })
                  }
                  type="button"
                >
                  {t('resume.review.acceptSelected', {
                    count: selectedCount,
                    defaultValue: '接受选中项（{{count}}）'
                  })}
                </button>
                <button
                  className="aw-danger-button"
                  onClick={(): void => props.onPrepareDecision({ kind: 'reject' })}
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                  {t('resume.review.rejectAll', { defaultValue: '拒绝建议' })}
                </button>
              </div>
            ) : null}

            {props.decisionAttempt !== null ? (
              <section className="aw-review-confirmation">
                <strong>
                  {mustConfirmSameDecision
                    ? t('resume.review.confirmSameDecisionTitle', {
                        defaultValue: '结果尚未确认，必须原样确认同一决策'
                      })
                    : t('resume.review.confirmDecisionTitle', {
                        defaultValue: '确认这次不可分割的决策'
                      })}
                </strong>
                <p>
                  {props.decisionAttempt.kind === 'accept-all'
                    ? t('resume.review.confirmAcceptAll', {
                        defaultValue: '全部建议操作会作为一个原子决策提交。'
                      })
                    : props.decisionAttempt.kind === 'accept-selected'
                      ? t('resume.review.confirmAcceptSelected', {
                          count:
                            props.decisionAttempt.command.decision.kind === 'accept-selected'
                              ? props.decisionAttempt.command.decision.operationIds.length
                              : 0,
                          defaultValue: '只接受选中的 {{count}} 个 operation-ID 组。'
                        })
                      : t('resume.review.confirmReject', {
                          defaultValue: '这条建议会进入已拒绝状态，Resume 内容不会改变。'
                        })}
                </p>
                {mustConfirmSameDecision ? (
                  <p className="aw-review-warning">
                    {t('resume.review.decisionUnknownAbandonNotice', {
                      defaultValue:
                        '你也可以放弃本地确认并重读建议；这不会撤销服务器可能已经接受的决策。'
                    })}
                  </p>
                ) : null}
                {props.decisionError !== null ? (
                  <p role="alert">
                    <ResourceFailureMessage error={props.decisionError} />
                  </p>
                ) : null}
                {idempotencyConflict === 'in-progress' ? (
                  <p className="aw-muted-copy">
                    {t('resume.review.retryAfter', {
                      defaultValue: '服务端仍在处理同一命令，请稍后原样确认。'
                    })}
                  </p>
                ) : null}
                <div className="aw-inline-actions">
                  {!decisionCannotReplay ? (
                    <button
                      className="aw-primary-button"
                      disabled={props.isDeciding || props.decisionConfirmationBlocked}
                      onClick={props.onConfirmDecision}
                      type="button"
                    >
                      {props.isDeciding
                        ? t('resume.review.deciding', { defaultValue: '正在提交决策…' })
                        : props.decisionConfirmationBlocked
                          ? t('resume.review.decisionRetryWaiting', {
                              defaultValue: '等待服务端允许确认…'
                            })
                          : mustConfirmSameDecision
                            ? t('resume.review.confirmSameDecision', {
                                defaultValue: '确认同一决策结果'
                              })
                            : props.decisionError !== null
                              ? t('resume.review.retrySameDecision', {
                                  defaultValue: '重试同一决策'
                                })
                              : t('resume.review.confirmDecision', { defaultValue: '确认提交' })}
                    </button>
                  ) : null}
                  {!mustConfirmSameDecision && props.decisionError === null ? (
                    <button
                      className="aw-quiet-button"
                      onClick={props.onAbandonDecision}
                      type="button"
                    >
                      {t('common.cancel', { defaultValue: '取消' })}
                    </button>
                  ) : null}
                  {props.decisionError !== null ? (
                    <button
                      className="aw-quiet-button"
                      onClick={props.onReloadProposal}
                      type="button"
                    >
                      {t('resume.review.reloadProposal', { defaultValue: '放弃旧命令并重读建议' })}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {props.decisionResult !== null ? (
              <>
                <p aria-live="polite" className="aw-success-note" role="status">
                  {props.decisionResult.conflicts.length > 0
                    ? t('resume.review.decisionConflicted', {
                        defaultValue: '服务器原子拒绝了所选修改；没有发生部分应用。'
                      })
                    : t('resume.review.decisionApplied', {
                        defaultValue: '决策已确认。当前 Resume 已更新到版本 {{revision}}。',
                        revision: props.decisionResult.editor.resume.revision
                      })}
                </p>
                {props.decisionSyncError !== null ? (
                  <div className="aw-inline-error" role="alert">
                    <strong>
                      {t('resume.review.decisionSyncError', {
                        defaultValue: '决策已确认，但最新建议和版本列表尚未同步'
                      })}
                    </strong>
                    <p>
                      <ResourceFailureMessage error={props.decisionSyncError} />
                    </p>
                    <button
                      className="aw-quiet-button"
                      disabled={props.isDeciding}
                      onClick={props.onRetryDecisionSync}
                      type="button"
                    >
                      {t('resume.review.retryDecisionSync', {
                        defaultValue: '重新读取最新状态'
                      })}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

/**
 * @brief 承载 Review 页所有 Workspace-scoped 状态 / Own all Workspace-scoped state for the Review page.
 * @param props 首屏资源、端口与页签 / First-screen resources, ports, and tab.
 * @return 历史与建议的可恢复产品界面 / Recoverable product UI for history and proposals.
 */
function ResumeReviewWorkspace({
  onTabChange,
  resources,
  resume,
  resumeId,
  review,
  tab
}: ResumeReviewWorkspaceProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 诊断端口 / Diagnostics port. */
  const diagnostics = useDiagnostics()
  /** @brief Resume restore 跨上下文流程 / Cross-context Resume-restore process. */
  const restoreProcess = useResumeRestoreProcess()
  /** @brief 当前 Resume 权威；decision 成功后吸收返回值 / Current Resume authority, adopting a successful decision result. */
  const [currentEditor, setCurrentEditor] = useState(resources.editor)
  /** @brief Revision 列表与页关系 / Revision items and page relation. */
  const [revisionItems, setRevisionItems] = useState(resources.revisions.items)
  const [revisionPage, setRevisionPage] = useState(resources.revisions)
  /** @brief Proposal 列表与页关系 / Proposal items and page relation. */
  const [proposalItems, setProposalItems] = useState(resources.proposals.items)
  const [proposalPage, setProposalPage] = useState(resources.proposals)
  /** @brief 当前已加载页中的待审数量；有后续页时不是总数 / Pending count in loaded pages, not a total while another page exists. */
  const loadedPendingProposalCount = proposalItems.filter(
    (proposal) => proposal.status === 'pending'
  ).length
  /** @brief 详情与后续页状态 / Detail and continuation states. */
  const [revisionDetail, setRevisionDetail] = useState<DetailState<UiResumeRevision>>({
    status: 'idle'
  })
  const [proposalDetail, setProposalDetail] = useState<DetailState<UiResumeProposalAuthority>>({
    status: 'idle'
  })
  const [revisionContinuation, setRevisionContinuation] = useState<ContinuationState>({
    status: 'idle'
  })
  const [proposalContinuation, setProposalContinuation] = useState<ContinuationState>({
    status: 'idle'
  })
  /** @brief 当前选择与 decision 状态 / Current selection and decision state. */
  const [selectedProposalId, setSelectedProposalId] = useState<UiResumeProposal['id'] | null>(null)
  const [selectedOperationIds, setSelectedOperationIds] = useState<ReadonlySet<string>>(new Set())
  const [decisionAttempt, setDecisionAttempt] = useState<ProposalDecisionAttempt | null>(null)
  const [decisionError, setDecisionError] = useState<unknown>(null)
  const [decisionResult, setDecisionResult] = useState<UiResumeProposalDecisionResult | null>(null)
  const [decisionSyncError, setDecisionSyncError] = useState<unknown>(null)
  const [isDeciding, setDeciding] = useState(false)
  /** @brief Proposal decision 的 Retry-After 到期时刻 / Retry-After expiry instant for a Proposal decision. */
  const [decisionConfirmNotBefore, setDecisionConfirmNotBefore] = useState<number | null>(null)
  /** @brief 驱动 Proposal decision Retry-After 门的时钟 / Clock driving the Proposal-decision Retry-After gate. */
  const [decisionConfirmationClock, setDecisionConfirmationClock] = useState(0)
  /** @brief 历史恢复命令、Job、错误与成功权威 / Restore command, Job, failure, and confirmed authority. */
  const [restoreAttempt, setRestoreAttempt] = useState<ResumeRestoreAttempt | null>(null)
  const [restoreJobAuthority, setRestoreJobAuthority] = useState<UiWorkspaceJobAuthority | null>(
    null
  )
  const [restoreError, setRestoreError] = useState<unknown>(null)
  const [isRestoring, setRestoring] = useState(false)
  const [isCancellingRestore, setCancellingRestore] = useState(false)
  const [restoredRevision, setRestoredRevision] = useState<number | null>(null)
  /** @brief Retry-After 到期时刻 / Retry-After expiry instant. */
  const [restoreConfirmNotBefore, setRestoreConfirmNotBefore] = useState<number | null>(null)
  /** @brief 驱动 Retry-After 门重新求值的时钟 / Clock driving Retry-After gate reevaluation. */
  const [restoreConfirmationClock, setRestoreConfirmationClock] = useState(0)
  /** @brief React commit 前的单通道锁 / Single-lane locks before React commits. */
  const revisionContinuationRef = useRef(false)
  const proposalContinuationRef = useRef(false)
  const decisionInFlightRef = useRef(false)
  const restoreInFlightRef = useRef(false)
  const restoreCancelInFlightRef = useRef(false)
  /** @brief cancellation 在未知结果确认中保持稳定的命令 identity / Stable cancellation command identity across unknown-outcome confirmation. */
  const restoreCancelCommandIdRef = useRef<ReturnType<typeof createUiCommandId> | null>(null)
  /** @brief 当前详情请求取消器 / Current detail-request controllers. */
  const revisionDetailAbortRef = useRef<AbortController | null>(null)
  const proposalDetailAbortRef = useRef<AbortController | null>(null)
  const decisionAbortRef = useRef<AbortController | null>(null)
  const restoreAbortRef = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => () => {
      revisionDetailAbortRef.current?.abort(
        new DOMException('Resume revision selection changed.', 'AbortError')
      )
      proposalDetailAbortRef.current?.abort(
        new DOMException('Resume Proposal selection changed.', 'AbortError')
      )
      decisionAbortRef.current?.abort(new DOMException('Resume Review page closed.', 'AbortError'))
      restoreAbortRef.current?.abort(new DOMException('Resume Review page closed.', 'AbortError'))
    },
    []
  )

  useEffect((): (() => void) | undefined => {
    if (
      decisionConfirmNotBefore === null ||
      decisionConfirmationClock >= decisionConfirmNotBefore
    ) {
      return undefined
    }
    /** @brief 受宿主 timer 上限约束的下一段等待 / Next wait segment bounded by the host timer limit. */
    const delayMilliseconds = nextDeadlineTimerDelayMilliseconds(decisionConfirmNotBefore)
    if (delayMilliseconds === null) return undefined
    /** @brief 当前 decision Retry-After timer / Current decision Retry-After timer. */
    const timer = globalThis.setTimeout(
      (): void => setDecisionConfirmationClock(Date.now()),
      delayMilliseconds
    )
    return (): void => globalThis.clearTimeout(timer)
  }, [decisionConfirmationClock, decisionConfirmNotBefore])

  useEffect((): (() => void) | undefined => {
    if (restoreConfirmNotBefore === null || restoreConfirmationClock >= restoreConfirmNotBefore) {
      return undefined
    }
    /** @brief 受宿主上限约束的下一段等待 / Next wait segment bounded by the host limit. */
    const delayMilliseconds = nextDeadlineTimerDelayMilliseconds(restoreConfirmNotBefore)
    if (delayMilliseconds === null) return undefined
    /** @brief 当前分段 timer / Current segmented timer. */
    const timer = globalThis.setTimeout(
      (): void => setRestoreConfirmationClock(Date.now()),
      delayMilliseconds
    )
    return (): void => globalThis.clearTimeout(timer)
  }, [restoreConfirmationClock, restoreConfirmNotBefore])

  /** @brief 读取一个历史 revision / Read one historical revision. */
  const selectRevision = useCallback(
    async (revision: number): Promise<void> => {
      revisionDetailAbortRef.current?.abort(
        new DOMException('Another Resume revision was selected.', 'AbortError')
      )
      /** @brief 当前详情请求取消器 / Current detail-request controller. */
      const controller = new AbortController()
      revisionDetailAbortRef.current = controller
      setRevisionDetail({ status: 'loading' })
      try {
        /** @brief 完整不可变 revision / Complete immutable revision. */
        const value = await review.getResumeRevision(
          resources.workspaceId,
          resumeId,
          revision,
          controller.signal
        )
        if (!controller.signal.aborted) setRevisionDetail({ status: 'ready', value })
      } catch (error: unknown) {
        if (!controller.signal.aborted) setRevisionDetail({ error, status: 'error' })
      } finally {
        if (revisionDetailAbortRef.current === controller) revisionDetailAbortRef.current = null
      }
    },
    [resources.workspaceId, resumeId, review]
  )

  /** @brief 读取一个 Proposal 详情权威 / Read one authoritative Proposal detail. */
  const selectProposal = useCallback(
    async (proposal: UiResumeProposal): Promise<void> => {
      if (decisionInFlightRef.current) return
      proposalDetailAbortRef.current?.abort(
        new DOMException('Another Resume Proposal was selected.', 'AbortError')
      )
      /** @brief 当前详情请求取消器 / Current detail-request controller. */
      const controller = new AbortController()
      proposalDetailAbortRef.current = controller
      setSelectedProposalId(proposal.id)
      setProposalDetail({ status: 'loading' })
      setSelectedOperationIds(new Set())
      setDecisionAttempt(null)
      setDecisionError(null)
      setDecisionResult(null)
      setDecisionSyncError(null)
      setDecisionConfirmNotBefore(null)
      try {
        /** @brief 带强 ETag 的 Proposal 权威 / Proposal authority carrying a strong ETag. */
        const value = await review.getResumeProposal(
          resources.workspaceId,
          resumeId,
          proposal.id,
          controller.signal
        )
        if (!controller.signal.aborted) setProposalDetail({ status: 'ready', value })
      } catch (error: unknown) {
        if (!controller.signal.aborted) setProposalDetail({ error, status: 'error' })
      } finally {
        if (proposalDetailAbortRef.current === controller) proposalDetailAbortRef.current = null
      }
    },
    [resources.workspaceId, resumeId, review]
  )

  /** @brief 重读当前 Proposal 或恢复错误详情 / Reread the current Proposal or recover a failed detail. */
  const reloadProposal = useCallback((): void => {
    setDecisionAttempt(null)
    setDecisionError(null)
    setDecisionConfirmNotBefore(null)
    if (selectedProposalId === null) {
      setProposalDetail({ status: 'idle' })
      return
    }
    /** @brief 用于重新读取的列表投影 / List projection used for the reread. */
    const proposal = proposalItems.find((item) => item.id === selectedProposalId)
    if (proposal !== undefined) void selectProposal(proposal)
  }, [proposalItems, selectProposal, selectedProposalId])

  /** @brief 加载下一页 revision / Load the next revision page. */
  const loadMoreRevisions = useCallback(async (): Promise<void> => {
    if (!revisionPage.hasMore || revisionContinuationRef.current) return
    revisionContinuationRef.current = true
    setRevisionContinuation({ status: 'loading' })
    /** @brief 后续页取消器 / Continuation-page controller. */
    const controller = new AbortController()
    try {
      /** @brief 服务端声明的下一页 / Next page declared by the service. */
      const next = await review.listResumeRevisionPage({
        cursor: revisionPage.nextCursor,
        limit: REVIEW_PAGE_LIMIT,
        resumeId,
        signal: controller.signal,
        workspaceId: resources.workspaceId
      })
      setRevisionItems((current) => mergeRevisionSummaries(current, next.items))
      setRevisionPage(next)
      setRevisionContinuation({ status: 'idle' })
    } catch (error: unknown) {
      setRevisionContinuation({ error, status: 'error' })
    } finally {
      revisionContinuationRef.current = false
    }
  }, [resources.workspaceId, resumeId, review, revisionPage])

  /** @brief 加载下一页 Proposal / Load the next Proposal page. */
  const loadMoreProposals = useCallback(async (): Promise<void> => {
    if (!proposalPage.hasMore || proposalContinuationRef.current) return
    proposalContinuationRef.current = true
    setProposalContinuation({ status: 'loading' })
    /** @brief 后续页取消器 / Continuation-page controller. */
    const controller = new AbortController()
    try {
      /** @brief 服务端声明的下一页 / Next page declared by the service. */
      const next = await review.listResumeProposalPage({
        cursor: proposalPage.nextCursor,
        limit: REVIEW_PAGE_LIMIT,
        resumeId,
        signal: controller.signal,
        workspaceId: resources.workspaceId
      })
      setProposalItems((current) => mergeProposals(current, next.items))
      setProposalPage(next)
      setProposalContinuation({ status: 'idle' })
    } catch (error: unknown) {
      setProposalContinuation({ error, status: 'error' })
    } finally {
      proposalContinuationRef.current = false
    }
  }, [proposalPage, resources.workspaceId, resumeId, review])

  /** @brief 切换一个不可拆分 operation-ID 组 / Toggle one indivisible operation-ID group. */
  const toggleOperation = useCallback((group: UiResumeProposalOperationGroup): void => {
    setSelectedOperationIds((current) => {
      /** @brief 不共享引用的新选择集合 / New selection set sharing no references. */
      const next = new Set(current)
      if (next.has(group.operationId)) next.delete(group.operationId)
      else next.add(group.operationId)
      return next
    })
  }, [])

  /** @brief 冻结一次新的 Proposal decision / Freeze one new Proposal decision. */
  const prepareDecision = useCallback(
    (decision: UiResumeProposalDecision): void => {
      if (proposalDetail.status !== 'ready' || proposalDetail.value.proposal.status !== 'pending') {
        return
      }
      /** @brief 编译期与运行时均收窄的 pending Proposal / Pending Proposal narrowed at compile time and runtime. */
      const proposal: UiPendingResumeProposal = proposalDetail.value.proposal
      setDecisionAttempt({
        command: {
          commandId: createUiCommandId(),
          concurrencyToken: proposalDetail.value.concurrencyToken,
          decision,
          proposal
        },
        kind: decision.kind
      })
      setDecisionError(null)
      setDecisionResult(null)
      setDecisionSyncError(null)
      setDecisionConfirmNotBefore(null)
    },
    [proposalDetail]
  )

  /**
   * @brief 已确认 decision 后原子吸收最新 Proposal、revision 首页与详情 / Atomically adopt the latest Proposal page, revision page, and detail after a confirmed decision.
   * @param proposalId 已确认 decision 的 Proposal identity / Proposal identity of the confirmed decision.
   * @param signal 当前同步生命周期 / Current synchronization lifecycle.
   */
  const synchronizeConfirmedDecision = useCallback(
    async (proposalId: UiResumeProposal['id'], signal: AbortSignal): Promise<void> => {
      /** @brief 同一取消边界下的三份权威读取 / Three authoritative reads under one cancellation boundary. */
      const [proposals, revisions, authority] = await Promise.all([
        review.listResumeProposalPage({
          cursor: null,
          limit: REVIEW_PAGE_LIMIT,
          resumeId,
          signal,
          workspaceId: resources.workspaceId
        }),
        review.listResumeRevisionPage({
          cursor: null,
          limit: REVIEW_PAGE_LIMIT,
          resumeId,
          signal,
          workspaceId: resources.workspaceId
        }),
        review.getResumeProposal(resources.workspaceId, resumeId, proposalId, signal)
      ])
      signal.throwIfAborted()
      setProposalItems(proposals.items)
      setProposalPage(proposals)
      setRevisionItems(revisions.items)
      setRevisionPage(revisions)
      setProposalDetail({ status: 'ready', value: authority })
      setDecisionSyncError(null)
    },
    [resources.workspaceId, resumeId, review]
  )

  /** @brief 提交或原样确认当前冻结 decision / Submit or verbatim-confirm the current frozen decision. */
  const confirmDecision = useCallback(async (): Promise<void> => {
    if (
      decisionAttempt === null ||
      decisionInFlightRef.current ||
      (decisionConfirmNotBefore !== null && Date.now() < decisionConfirmNotBefore)
    ) {
      return
    }
    decisionInFlightRef.current = true
    decisionAbortRef.current?.abort(
      new DOMException('A newer Resume Proposal decision started.', 'AbortError')
    )
    /** @brief 当前 decision 与后续权威同步的取消器 / Controller for the current decision and authority synchronization. */
    const controller = new AbortController()
    decisionAbortRef.current = controller
    setDeciding(true)
    setDecisionError(null)
    setDecisionSyncError(null)
    try {
      /** @brief API v2 确认的原子 decision 结果 / Atomic decision result acknowledged by API v2. */
      let result: UiResumeProposalDecisionResult
      try {
        result = await runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.proposal_decision', scope: 'resume' },
          (): Promise<UiResumeProposalDecisionResult> =>
            review.decideResumeProposal({
              ...decisionAttempt.command,
              signal: controller.signal
            })
        )
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        setDecisionError(error)
        /** @brief API v2 Retry-After 相对等待 / Relative wait required by API v2 Retry-After. */
        const retryAfter = getResumeCommandRetryAfterMilliseconds(error)
        if (retryAfter !== null) {
          /** @brief 同一时钟读数派生出的绝对截止点 / Absolute deadline derived from one clock reading. */
          const now = Date.now()
          setDecisionConfirmationClock(now)
          setDecisionConfirmNotBefore(now + retryAfter)
        }
        return
      }
      controller.signal.throwIfAborted()
      setDecisionResult(result)
      setCurrentEditor(result.editor)
      setDecisionAttempt(null)
      setSelectedOperationIds(new Set())
      setDecisionConfirmNotBefore(null)
      try {
        await synchronizeConfirmedDecision(decisionAttempt.command.proposal.id, controller.signal)
      } catch (error: unknown) {
        if (!controller.signal.aborted) setDecisionSyncError(error)
      }
    } finally {
      if (decisionAbortRef.current === controller) decisionAbortRef.current = null
      decisionInFlightRef.current = false
      if (!controller.signal.aborted) setDeciding(false)
    }
  }, [decisionConfirmNotBefore, decisionAttempt, diagnostics, review, synchronizeConfirmedDecision])

  /** @brief 重试已确认 decision 后的权威同步，而不重复写命令 / Retry post-decision authority synchronization without repeating the write command. */
  const retryDecisionSync = useCallback(async (): Promise<void> => {
    if (selectedProposalId === null || decisionResult === null || decisionInFlightRef.current) {
      return
    }
    decisionInFlightRef.current = true
    decisionAbortRef.current?.abort(
      new DOMException('A newer Proposal authority synchronization started.', 'AbortError')
    )
    /** @brief 只读恢复调用取消器 / Controller for the read-only recovery call. */
    const controller = new AbortController()
    decisionAbortRef.current = controller
    setDeciding(true)
    setDecisionSyncError(null)
    try {
      await synchronizeConfirmedDecision(selectedProposalId, controller.signal)
    } catch (error: unknown) {
      if (!controller.signal.aborted) setDecisionSyncError(error)
    } finally {
      if (decisionAbortRef.current === controller) decisionAbortRef.current = null
      decisionInFlightRef.current = false
      if (!controller.signal.aborted) setDeciding(false)
    }
  }, [decisionResult, selectedProposalId, synchronizeConfirmedDecision])

  /** @brief 为选中的历史 revision 冻结一次新的 restore 意图 / Freeze one new restore intent for the selected historical revision. */
  const prepareRestore = useCallback(
    (sourceRevision: number): void => {
      if (
        restoreAttempt !== null ||
        sourceRevision === currentEditor.resume.revision ||
        !Number.isSafeInteger(sourceRevision)
      ) {
        return
      }
      setRestoreAttempt({
        input: {
          commandId: createUiCommandId(),
          concurrencyToken: currentEditor.concurrencyToken,
          currentRevision: currentEditor.resume.revision,
          resumeId: currentEditor.resume.id,
          sourceRevision,
          workspaceId: currentEditor.resume.workspaceId
        }
      })
      setRestoreJobAuthority(null)
      setRestoreError(null)
      setRestoredRevision(null)
      setRestoreConfirmNotBefore(null)
      restoreCancelCommandIdRef.current = null
    },
    [currentEditor, restoreAttempt]
  )

  /** @brief 提交、确认或继续观察同一个 restore 意图 / Submit, confirm, or continue observing the same restore intent. */
  const confirmRestore = useCallback(async (): Promise<void> => {
    if (restoreAttempt === null || restoreInFlightRef.current) return
    restoreInFlightRef.current = true
    restoreAbortRef.current?.abort(
      new DOMException('A newer Resume restore observation started.', 'AbortError')
    )
    /** @brief 当前恢复调用取消器 / Controller for the current restore call. */
    const controller = new AbortController()
    restoreAbortRef.current = controller
    setRestoring(true)
    setRestoreError(null)
    try {
      /** @brief 已知或刚创建的 restore Job 权威 / Known or newly created restore-Job authority. */
      let authority = restoreJobAuthority
      if (authority === null) {
        authority = await runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.restore', scope: 'resume' },
          (): Promise<UiWorkspaceJobAuthority> =>
            restoreProcess.start({ ...restoreAttempt.input, signal: controller.signal })
        )
        controller.signal.throwIfAborted()
        setRestoreJobAuthority(authority)
      }
      /** @brief 恢复命令绑定的不可变目标 / Immutable target bound to the restore command. */
      const target: ResumeRestoreTarget = {
        currentRevision: restoreAttempt.input.currentRevision,
        resumeId: restoreAttempt.input.resumeId,
        sourceRevision: restoreAttempt.input.sourceRevision,
        workspaceId: restoreAttempt.input.workspaceId
      }
      if (authority.job.status === 'queued' || authority.job.status === 'running') {
        authority = await restoreProcess.watchToTerminal(
          target,
          authority,
          controller.signal,
          (observation): void => {
            if (!controller.signal.aborted) setRestoreJobAuthority(observation)
          }
        )
        controller.signal.throwIfAborted()
        setRestoreJobAuthority(authority)
      }
      if (authority.job.status !== 'succeeded') return
      /** @brief 成功 Job 后重新读取的当前 Resume 权威 / Current Resume authority reread after the succeeded Job. */
      const restored = await restoreProcess.readRestoredResume(
        target,
        authority.job,
        controller.signal
      )
      controller.signal.throwIfAborted()
      setCurrentEditor(restored)
      setRestoredRevision(restored.resume.revision)
      /** @brief 恢复成功后重新读取的 revision 首页 / Revision first page reread after successful restore. */
      const refreshedRevisions = await review.listResumeRevisionPage({
        cursor: null,
        limit: REVIEW_PAGE_LIMIT,
        resumeId,
        signal: controller.signal,
        workspaceId: resources.workspaceId
      })
      controller.signal.throwIfAborted()
      setRevisionItems(refreshedRevisions.items)
      setRevisionPage(refreshedRevisions)
      setRestoreConfirmNotBefore(null)
      restoreCancelCommandIdRef.current = null
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      setRestoreError(error)
      /** @brief API v2 Retry-After 相对等待 / Relative wait required by API v2 Retry-After. */
      const retryAfter = getResumeCommandRetryAfterMilliseconds(error)
      if (retryAfter !== null) {
        setRestoreConfirmationClock(Date.now())
        setRestoreConfirmNotBefore(Date.now() + retryAfter)
      }
    } finally {
      if (restoreAbortRef.current === controller) {
        restoreAbortRef.current = null
        setRestoring(false)
      }
      restoreInFlightRef.current = false
    }
  }, [
    diagnostics,
    resources.workspaceId,
    restoreAttempt,
    restoreJobAuthority,
    restoreProcess,
    resumeId,
    review
  ])

  /** @brief 放弃旧 restore command 并重新读取当前 Resume / Abandon the old restore command and reread the current Resume. */
  const abandonRestoreAndReload = useCallback(async (): Promise<void> => {
    restoreAbortRef.current?.abort(
      new DOMException('The previous Resume restore command was abandoned.', 'AbortError')
    )
    /** @brief 权威重读取消器 / Controller for the authority reread. */
    const controller = new AbortController()
    restoreAbortRef.current = controller
    setRestoring(true)
    try {
      /** @brief 最新当前 Resume 权威 / Latest current Resume authority. */
      const editor = await resume.getResumeEditor(
        resources.workspaceId,
        resumeId,
        controller.signal
      )
      controller.signal.throwIfAborted()
      setCurrentEditor(editor)
      setRestoreAttempt(null)
      setRestoreJobAuthority(null)
      setRestoreError(null)
      setRestoredRevision(null)
      setRestoreConfirmNotBefore(null)
      restoreCancelCommandIdRef.current = null
    } catch (error: unknown) {
      if (!controller.signal.aborted) setRestoreError(error)
    } finally {
      if (restoreAbortRef.current === controller) {
        restoreAbortRef.current = null
        setRestoring(false)
      }
    }
  }, [resources.workspaceId, resume, resumeId])

  /** @brief 取消已知且仍执行中的 restore Job / Cancel a known restore Job still in progress. */
  const cancelRestore = useCallback(async (): Promise<void> => {
    if (
      restoreAttempt === null ||
      restoreJobAuthority === null ||
      restoreCancelInFlightRef.current ||
      (restoreJobAuthority.job.status !== 'queued' && restoreJobAuthority.job.status !== 'running')
    ) {
      return
    }
    restoreCancelInFlightRef.current = true
    restoreAbortRef.current?.abort(
      new DOMException('Resume restore observation was cancelled by the user.', 'AbortError')
    )
    /** @brief cancellation 独占取消器 / Controller dedicated to the cancellation. */
    const controller = new AbortController()
    restoreAbortRef.current = controller
    /** @brief 同一 cancellation 意图中稳定的 command identity / Stable command identity within the same cancellation intent. */
    const commandId = restoreCancelCommandIdRef.current ?? createUiCommandId()
    restoreCancelCommandIdRef.current = commandId
    setRestoring(true)
    setCancellingRestore(true)
    setRestoreError(null)
    try {
      /** @brief cancellation 绑定的恢复目标 / Restore target bound to the cancellation. */
      const target: ResumeRestoreTarget = {
        currentRevision: restoreAttempt.input.currentRevision,
        resumeId: restoreAttempt.input.resumeId,
        sourceRevision: restoreAttempt.input.sourceRevision,
        workspaceId: restoreAttempt.input.workspaceId
      }
      /** @brief cancellation 后的新 Job 权威 / New Job authority after cancellation. */
      const cancelled = await restoreProcess.cancel(
        target,
        restoreJobAuthority,
        commandId,
        controller.signal
      )
      controller.signal.throwIfAborted()
      setRestoreJobAuthority(cancelled)
      restoreCancelCommandIdRef.current = null
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setRestoreError(error)
        if (
          getResumeIdempotencyConflict(error) === 'key-reused' ||
          isResumeUnreplayableContractResponse(error)
        ) {
          restoreCancelCommandIdRef.current = null
        }
      }
    } finally {
      if (restoreAbortRef.current === controller) {
        restoreAbortRef.current = null
        setRestoring(false)
      }
      restoreCancelInFlightRef.current = false
      setCancellingRestore(false)
    }
  }, [restoreAttempt, restoreJobAuthority, restoreProcess])

  return (
    <main className="aw-page aw-resume-review-page">
      <header className="aw-review-page-header">
        <div>
          <Link className="aw-back-link" to={`/resumes/${resumeId}/edit`}>
            <ArrowLeft aria-hidden="true" size={17} />
            {t('resume.review.backToEditor', { defaultValue: '返回编辑器' })}
          </Link>
          <span className="aw-eyebrow">{resources.workspaceName}</span>
          <h1>{t('resume.review.title', { defaultValue: '版本与建议' })}</h1>
          <p>
            {t('resume.review.description', {
              defaultValue: '检查不可变历史和 Agent 候选修改；任何建议都不会自动应用。'
            })}
          </p>
        </div>
        <span className="aw-review-current-revision">
          {t('resume.review.currentRevision', {
            defaultValue: '当前 Resume 版本 {{revision}}',
            revision: currentEditor.resume.revision
          })}
        </span>
      </header>

      <nav
        aria-label={t('resume.review.tabs', { defaultValue: '版本与建议视图' })}
        className="aw-review-tabs"
      >
        <button
          aria-current={tab === 'history' ? 'page' : undefined}
          className={tab === 'history' ? 'is-active' : undefined}
          onClick={(): void => onTabChange('history')}
          type="button"
        >
          <History aria-hidden="true" size={17} />
          {t('resume.review.historyTab', { defaultValue: '版本历史' })}
        </button>
        <button
          aria-current={tab === 'proposals' ? 'page' : undefined}
          className={tab === 'proposals' ? 'is-active' : undefined}
          onClick={(): void => onTabChange('proposals')}
          type="button"
        >
          <Sparkles aria-hidden="true" size={17} />
          {t('resume.review.proposalsTab', { defaultValue: 'Agent 建议' })}
          {loadedPendingProposalCount > 0 ? (
            <span
              aria-label={t('resume.review.loadedPendingCount', {
                count: loadedPendingProposalCount,
                defaultValue: '已加载 {{count}} 条待审建议'
              })}
              className="aw-review-count"
            >
              {loadedPendingProposalCount}
              {proposalPage.hasMore ? '+' : ''}
            </span>
          ) : null}
        </button>
      </nav>

      {tab === 'history' ? (
        <ResumeHistoryPanel
          continuation={revisionContinuation}
          currentEditor={currentEditor}
          items={revisionItems}
          onLoadMore={(): void => {
            void loadMoreRevisions()
          }}
          onSelect={selectRevision}
          page={revisionPage}
          restoreControls={{
            attempt: restoreAttempt,
            confirmationBlocked:
              restoreConfirmNotBefore !== null &&
              restoreConfirmationClock < restoreConfirmNotBefore,
            error: restoreError,
            isCancelling: isCancellingRestore,
            isRestoring,
            jobAuthority: restoreJobAuthority,
            onAbandonAndReload: (): void => {
              void abandonRestoreAndReload()
            },
            onCancelJob: (): void => {
              void cancelRestore()
            },
            onConfirm: (): void => {
              void confirmRestore()
            },
            onDismiss: (): void => {
              restoreAbortRef.current?.abort(
                new DOMException('Resume restore controls were dismissed.', 'AbortError')
              )
              setRestoreAttempt(null)
              setRestoreJobAuthority(null)
              setRestoreError(null)
              setRestoredRevision(null)
              setRestoreConfirmNotBefore(null)
              restoreCancelCommandIdRef.current = null
            },
            onPrepare: prepareRestore,
            restoredRevision
          }}
          selected={revisionDetail}
        />
      ) : (
        <ResumeProposalPanel
          continuation={proposalContinuation}
          decisionAttempt={decisionAttempt}
          decisionConfirmationBlocked={
            decisionConfirmNotBefore !== null &&
            decisionConfirmationClock < decisionConfirmNotBefore
          }
          decisionError={decisionError}
          decisionResult={decisionResult}
          decisionSyncError={decisionSyncError}
          isDeciding={isDeciding}
          items={proposalItems}
          onAbandonDecision={(): void => {
            setDecisionAttempt(null)
            setDecisionError(null)
            setDecisionConfirmNotBefore(null)
          }}
          onConfirmDecision={(): void => {
            void confirmDecision()
          }}
          onLoadMore={(): void => {
            void loadMoreProposals()
          }}
          onPrepareDecision={prepareDecision}
          onReloadProposal={reloadProposal}
          onRetryDecisionSync={(): void => {
            void retryDecisionSync()
          }}
          onSelect={selectProposal}
          onToggleOperation={toggleOperation}
          page={proposalPage}
          selected={proposalDetail}
          selectedOperationIds={selectedOperationIds}
        />
      )}
    </main>
  )
}

/**
 * @brief Resume 历史与建议审阅路由页 / Route page for Resume history and Proposal review.
 * @return 带 Workspace 授权、加载与失败状态的产品页 / Product page with Workspace authorization, loading, and failure states.
 */
export function ResumeReviewPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由身份与地址栏页签 / Route identity and addressable tab. */
  const { resumeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  /** @brief 应用端口 / Application ports. */
  const resume = useResumeGateway()
  const review = useResumeReview()
  const { getCurrentWorkspace } = useWorkspaceSession()
  /** @brief 不透明 Resume identity / Opaque Resume identity. */
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])
  /** @brief 未知 tab 值失败关闭到 history / Unknown tab values fail closed to history. */
  const tab: ReviewTab = searchParams.get('tab') === 'proposals' ? 'proposals' : 'history'

  /** @brief 加载当前 Workspace 下的 Review 首屏权威 / Load first-screen Review authority in the current Workspace. */
  const loadResources = useCallback(
    async (signal: AbortSignal): Promise<ResumeReviewResources> => {
      signal.throwIfAborted()
      if (resumeId === undefined) throw new Error('A Resume identifier is required.')
      /** @brief 当前 Workspace 权威 / Current Workspace authority. */
      const workspace = await getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspace === undefined) return { kind: 'no-workspace' }
      /** @brief 并行读取当前 Resume、revision 与 Proposal 首页 / Current Resume, revision, and Proposal first pages read in parallel. */
      const [editor, revisions, proposals] = await Promise.all([
        resume.getResumeEditor(workspace.id, requestedResumeId, signal),
        review.listResumeRevisionPage({
          cursor: null,
          limit: REVIEW_PAGE_LIMIT,
          resumeId: requestedResumeId,
          signal,
          workspaceId: workspace.id
        }),
        review.listResumeProposalPage({
          cursor: null,
          limit: REVIEW_PAGE_LIMIT,
          resumeId: requestedResumeId,
          signal,
          workspaceId: workspace.id
        })
      ])
      signal.throwIfAborted()
      return {
        editor,
        kind: 'workspace',
        proposals,
        revisions,
        workspaceId: workspace.id,
        workspaceName: workspace.name
      }
    },
    [getCurrentWorkspace, requestedResumeId, resume, resumeId, review]
  )
  /** @brief 首屏异步资源 / First-screen async resource. */
  const resources = useAsyncResource('resume.review', loadResources, requestedResumeId)

  if (resources.status === 'loading') {
    return (
      <main className="aw-page">
        <LoadingState label={t('resume.review.loading', { defaultValue: '正在加载版本与建议…' })} />
      </main>
    )
  }
  if (resources.status === 'error') {
    return (
      <main className="aw-page">
        <ResourceErrorState
          error={resources.error}
          onRetry={resources.retry}
          title={t('resume.review.loadError', { defaultValue: '无法加载版本与建议' })}
        />
      </main>
    )
  }
  if (resources.data.kind === 'no-workspace') {
    return (
      <main className="aw-page">
        <EmptyState
          description={t('resume.review.noWorkspaceDescription', {
            defaultValue: '请选择一个可访问的工作区，再查看其中 Resume 的历史和建议。'
          })}
          title={t('resume.review.noWorkspaceTitle', { defaultValue: '未选择工作区' })}
          visual={<Layers3 aria-hidden="true" />}
        />
      </main>
    )
  }

  return (
    <ResumeReviewWorkspace
      key={`${resources.data.workspaceId}:${requestedResumeId}`}
      onTabChange={(nextTab): void => {
        /** @brief 只保留公开且稳定的 tab 参数 / Retain only the public, stable tab parameter. */
        setSearchParams(nextTab === 'history' ? {} : { tab: nextTab }, { replace: true })
      }}
      resources={resources.data}
      resume={resume}
      resumeId={requestedResumeId}
      review={review}
      tab={tab}
    />
  )
}
