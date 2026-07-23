/** @file 可恢复的手工笔记 KnowledgeSource 创建页 / Recoverable manual-note KnowledgeSource creation page. */

import { ArrowLeft, CircleAlert, FilePlus2, RotateCcw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  useAsyncResource,
  useKnowledgeManualNoteCreation,
  useWorkspaceSession
} from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { useUnsavedChanges } from '../../../app/UnsavedChanges'
import type { WorkspaceSessionAccess } from '../../../app/session/workspace-session'
import { EmptyState, LoadingState } from '../../../ui'
import type { UiWorkspace } from '../../workspace'
import type { UiKnowledgeSourceId } from '../../../shared-kernel/identity'
import type {
  UiKnowledgeCreationScope,
  UiManualKnowledgeNoteDraft,
  UiPendingManualKnowledgeNoteCreation
} from '../application/manual-note-creation'
import {
  createSafeKnowledgeVisibilityPolicy,
  validateKnowledgeVisibilityPolicy,
  VisibilityPolicyFields,
  type VisibilityPolicyValidationError
} from './VisibilityPolicyFields'

/** @brief API v2 来源名称最大 Unicode code point 数 / Maximum Unicode code points in an API v2 source name. */
const SOURCE_NAME_MAX_CODE_POINTS = 300

/** @brief API v2 手工笔记正文最大 Unicode code point 数 / Maximum Unicode code points in an API v2 manual-note body. */
const NOTE_CONTENT_MAX_CODE_POINTS = 200_000

/** @brief 手工笔记表单稳定校验错误 / Stable validation error for the manual-note form. */
type ManualNoteValidationError =
  | 'content-required'
  | 'content-too-long'
  | 'name-required'
  | 'name-too-long'
  | VisibilityPolicyValidationError

/** @brief 创建页提交状态 / Creation-page submission state. */
type CreateSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' | 'confirming' | 'abandoning' }
  | { readonly status: 'error'; readonly error: unknown }

/**
 * @brief 计算 Unicode code point 数 / Count Unicode code points.
 * @param value 待计算字符串 / String to count.
 * @return 不拆分 surrogate pair 的长度 / Length without splitting surrogate pairs.
 */
function codePointLength(value: string): number {
  return [...value].length
}

/**
 * @brief 校验完整创建草稿 / Validate a complete creation draft.
 * @param draft 待提交草稿 / Draft to submit.
 * @return 第一项稳定错误；合法时为 null / First stable error, or null when valid.
 */
function validateDraft(draft: UiManualKnowledgeNoteDraft): ManualNoteValidationError | null {
  if (draft.name.trim().length < 1) return 'name-required'
  if (codePointLength(draft.name) > SOURCE_NAME_MAX_CODE_POINTS) return 'name-too-long'
  if (draft.content.trim().length < 1) return 'content-required'
  if (codePointLength(draft.content) > NOTE_CONTENT_MAX_CODE_POINTS) {
    return 'content-too-long'
  }
  return validateKnowledgeVisibilityPolicy(draft.visibility)
}

/**
 * @brief 映射校验错误为安全本地文案 / Map a validation error to safe local copy.
 * @param error 稳定校验错误 / Stable validation error.
 * @return 简体中文默认文案 / Simplified-Chinese fallback copy.
 */
function validationMessage(error: ManualNoteValidationError): string {
  /** @brief 校验文案表 / Validation-copy table. */
  const messages: Readonly<Record<ManualNoteValidationError, string>> = {
    'agent-grant-limit': 'Agent 规则不能超过 100 条。',
    'agent-operation-required': '每条 Agent 规则至少需要一个适用操作，且不能重复。',
    'agent-scope-invalid': 'Agent scope 必须匹配小写 code 格式。',
    'content-required': '请输入笔记正文。',
    'content-too-long': '笔记正文不能超过 200,000 个字符。',
    'model-region-required': '至少选择一个模型处理区域。',
    'name-required': '请输入来源名称。',
    'name-too-long': '来源名称不能超过 300 个字符。',
    'policy-version-invalid': '策略领域版本必须是正整数。',
    'retention-days-invalid': '保留天数必须是 1 到 3650，或不设置固定期限。'
  }
  return messages[error]
}

/** @brief 已加载 Workspace authority 的创建表单属性 / Creation-form properties with loaded Workspace authority. */
interface ManualNoteCreateContentProps {
  /** @brief 当前 Workspace 会话权威 / Current Workspace-session authority. */
  readonly access: WorkspaceSessionAccess
  /** @brief 已选择且可访问的 Workspace / Selected and accessible Workspace. */
  readonly workspace: UiWorkspace
}

/**
 * @brief 已加载 Workspace scope 的手工笔记表单 / Manual-note form with a loaded Workspace scope.
 * @param props 当前 principal 与 Workspace authority / Current principal and Workspace authority.
 * @return 含幂等确认与两阶段放弃的创建体验 / Creation experience with idempotent confirmation and two-phase abandonment.
 */
function ManualNoteCreateContent({
  access,
  workspace
}: ManualNoteCreateContentProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 成功后进入权威详情的导航函数 / Navigation function entering authority detail after success. */
  const navigate = useNavigate()
  /** @brief provider 生命周期内稳定的创建恢复流程 / Creation-recovery process stable for the provider lifecycle. */
  const creation = useKnowledgeManualNoteCreation()
  /** @brief principal 与 Workspace 共同隔离的恢复 scope / Recovery scope isolated by principal and Workspace. */
  const scope = useMemo<UiKnowledgeCreationScope>(
    () => ({
      principalSubject: access.currentUser.subject,
      workspaceId: workspace.id
    }),
    [access.currentUser.subject, workspace.id]
  )
  /** @brief 首次渲染时进程内可能存在的冻结命令 / Frozen command possibly retained in process memory on first render. */
  const initialPending = useMemo(() => creation.getPending(scope), [creation, scope])
  /** @brief 当前表单草稿；未决命令存在时从冻结 payload 恢复 / Current form draft restored from the frozen payload when pending. */
  const [draft, setDraft] = useState<UiManualKnowledgeNoteDraft>(() =>
    initialPending === null
      ? {
          content: '',
          name: '',
          visibility: createSafeKnowledgeVisibilityPolicy(workspace.dataRegion)
        }
      : {
          content: initialPending.command.content,
          name: initialPending.command.name,
          visibility: initialPending.command.visibility
        }
  )
  /** @brief 当前进程内未决创建投影 / Current projection of the process-memory pending creation. */
  const [pending, setPending] = useState<UiPendingManualKnowledgeNoteCreation | null>(
    initialPending
  )
  /** @brief 提交、确认或放弃状态 / Submit, confirmation, or abandonment state. */
  const [submission, setSubmission] = useState<CreateSubmissionState>({ status: 'idle' })
  /** @brief 当前客户端校验错误 / Current client validation error. */
  const [validationError, setValidationError] = useState<ManualNoteValidationError | null>(null)
  /** @brief 是否已展开两阶段放弃确认 / Whether the second-stage abandonment confirmation is expanded. */
  const [showAbandonConfirmation, setShowAbandonConfirmation] = useState(false)
  /** @brief 重读后仍无法判定创建结果的显式提示 / Explicit warning that rereading cannot determine the creation result. */
  const [showPossibleDuplicateWarning, setShowPossibleDuplicateWarning] = useState(false)
  /** @brief 已确认创建、等待导航的来源 ID / Confirmed source ID awaiting navigation. */
  const [createdSourceId, setCreatedSourceId] = useState<UiKnowledgeSourceId | null>(null)
  /** @brief 用于解锁 Retry-After 按钮的本地时钟 / Local clock used to unlock a Retry-After button. */
  const [clockMilliseconds, setClockMilliseconds] = useState(Number.NEGATIVE_INFINITY)
  /** @brief 任一写调用进行中时冻结表单 / Whether an active write call locks the form. */
  const isBusy =
    submission.status === 'submitting' ||
    submission.status === 'confirming' ||
    submission.status === 'abandoning'
  /** @brief 未决命令存在时禁止改变其请求指纹 / Whether a pending command locks its request fingerprint. */
  const isFormLocked = isBusy || pending !== null
  /** @brief 精确确认是否仍受 Retry-After 冷却 / Whether exact confirmation remains in Retry-After cooldown. */
  const confirmationIsCoolingDown =
    pending?.mode === 'exact-replay' &&
    pending.confirmAfterMilliseconds !== null &&
    pending.confirmAfterMilliseconds > clockMilliseconds
  /** @brief 离开页面前需要保护的草稿或未知写入 / Draft or unknown write that must be protected before navigation. */
  const hasUnsavedState =
    createdSourceId === null &&
    (pending !== null ||
      draft.name.length > 0 ||
      draft.content.length > 0 ||
      JSON.stringify(draft.visibility) !==
        JSON.stringify(createSafeKnowledgeVisibilityPolicy(workspace.dataRegion)))

  useUnsavedChanges('knowledge.manual-note-create', hasUnsavedState)

  useEffect((): (() => void) | undefined => {
    /** @brief 当前冻结命令的确认截止时刻 / Confirmation deadline for the current frozen command. */
    const confirmAfterMilliseconds =
      pending?.mode === 'exact-replay' ? pending.confirmAfterMilliseconds : null
    if (confirmAfterMilliseconds === null || !confirmationIsCoolingDown) {
      return undefined
    }
    /** @brief 到达服务端允许确认时刻的剩余等待 / Remaining wait until confirmation is allowed. */
    const delay = Math.min(confirmAfterMilliseconds - Date.now(), 2_147_000_000)
    /** @brief 到期时触发重渲染的计时器 / Timer triggering a rerender when the cooldown expires. */
    const timeout = window.setTimeout(
      (): void => {
        setClockMilliseconds(confirmAfterMilliseconds)
      },
      Math.max(0, delay)
    )
    return (): void => window.clearTimeout(timeout)
  }, [confirmationIsCoolingDown, pending])

  useEffect((): void => {
    if (createdSourceId !== null) {
      void navigate(`/knowledge/${createdSourceId}`, { replace: true })
    }
  }, [createdSourceId, navigate])

  /**
   * @brief 将进程最新未决状态同步回页面 / Synchronize the latest process pending state into the page.
   * @return 当前未决投影 / Current pending projection.
   */
  const refreshPending = useCallback((): UiPendingManualKnowledgeNoteCreation | null => {
    /** @brief 创建流程最新状态 / Latest creation-process state. */
    const latest = creation.getPending(scope)
    setPending(latest)
    setClockMilliseconds(Number.NEGATIVE_INFINITY)
    return latest
  }, [creation, scope])

  /**
   * @brief 提交一个新的完整创建意图 / Submit one new complete creation intent.
   */
  const submitNewIntent = useCallback(async (): Promise<void> => {
    if (isFormLocked) return
    /** @brief 当前完整草稿的校验结果 / Validation result for the complete current draft. */
    const invalid = validateDraft(draft)
    setValidationError(invalid)
    if (invalid !== null) return
    setSubmission({ status: 'submitting' })
    setShowPossibleDuplicateWarning(false)
    try {
      /** @brief 服务端确认的创建结果 / Creation result confirmed by the service. */
      const authority = await creation.create(scope, draft)
      setPending(null)
      setSubmission({ status: 'idle' })
      setCreatedSourceId(authority.source.id)
    } catch (error: unknown) {
      refreshPending()
      setSubmission({ error, status: 'error' })
    }
  }, [creation, draft, isFormLocked, refreshPending, scope])

  /**
   * @brief 精确确认同一冻结命令 / Confirm the exact same frozen command.
   */
  const confirmPendingIntent = useCallback(async (): Promise<void> => {
    if (isBusy || pending?.mode !== 'exact-replay' || confirmationIsCoolingDown) return
    setSubmission({ status: 'confirming' })
    try {
      /** @brief 服务端确认的创建结果 / Creation result confirmed by the service. */
      const authority = await creation.confirm(scope)
      setPending(null)
      setSubmission({ status: 'idle' })
      setCreatedSourceId(authority.source.id)
    } catch (error: unknown) {
      refreshPending()
      setSubmission({ error, status: 'error' })
    }
  }, [confirmationIsCoolingDown, creation, isBusy, pending?.mode, refreshPending, scope])

  /**
   * @brief 重读权威首页成功后放弃旧 key / Abandon the old key after successfully rereading authority.
   */
  const abandonAfterRead = useCallback(async (): Promise<void> => {
    if (isBusy || pending === null) return
    setSubmission({ status: 'abandoning' })
    /** @brief 本次权威读取的取消控制器 / Abort controller for this authority read. */
    const controller = new AbortController()
    try {
      await creation.abandonAfterAuthorityRead(scope, controller.signal)
      setPending(null)
      setSubmission({ status: 'idle' })
      setShowAbandonConfirmation(false)
      setShowPossibleDuplicateWarning(true)
    } catch (error: unknown) {
      refreshPending()
      setSubmission({ error, status: 'error' })
    }
  }, [creation, isBusy, pending, refreshPending, scope])

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('knowledge.create.eyebrow', { defaultValue: 'API v2 · 手工笔记' })}
          </p>
          <h1 className="aw-page-title">
            {t('knowledge.create.title', { defaultValue: '新建手工笔记来源' })}
          </h1>
          <p className="aw-page-description">
            {t('knowledge.create.description', {
              defaultValue: '正文只在创建请求中发送；创建后的来源不会提供正文查看或编辑能力。'
            })}
          </p>
        </div>
        <Link className="aw-quiet-button" to="/knowledge">
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回知识库' })}
        </Link>
      </div>

      {pending !== null ? (
        <section aria-live="polite" className="aw-card aw-card-pad aw-recovery-card">
          <div className="aw-inline-actions">
            <CircleAlert aria-hidden="true" className="aw-warning-icon" size={19} />
            <div>
              <h2 className="aw-card-title">
                {pending.mode === 'exact-replay'
                  ? t('knowledge.create.confirmationRequired', {
                      defaultValue: '上一次创建结果尚未确认'
                    })
                  : t('knowledge.create.authorityReviewRequired', {
                      defaultValue: '旧命令不能继续确认'
                    })}
              </h2>
              <p className="aw-card-description">
                {pending.mode === 'exact-replay'
                  ? t('knowledge.create.exactReplayHelp', {
                      defaultValue:
                        '表单已锁定。只能用同一幂等键和完全相同的正文确认，不能修改后重试。'
                    })
                  : t('knowledge.create.reviewHelp', {
                      defaultValue:
                        '响应无法用于安全确认。服务器可能已经创建来源，请先重读权威列表再决定是否发起新意图。'
                    })}
              </p>
            </div>
          </div>
          {pending.referenceId === null ? null : (
            <p className="aw-setting-help">
              {t('errors.reference', { referenceId: pending.referenceId })}
            </p>
          )}
          <div className="aw-inline-actions">
            {pending.mode === 'exact-replay' ? (
              <button
                className="aw-primary-button"
                disabled={isBusy || confirmationIsCoolingDown}
                onClick={(): void => {
                  void confirmPendingIntent()
                }}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={15} />
                {confirmationIsCoolingDown
                  ? t('knowledge.create.confirmAfter', {
                      defaultValue: '服务端要求稍后再确认'
                    })
                  : t('knowledge.create.confirmExact', {
                      defaultValue: '原样确认上次创建'
                    })}
              </button>
            ) : null}
            <button
              className="aw-quiet-button"
              disabled={isBusy}
              onClick={(): void => setShowAbandonConfirmation(true)}
              type="button"
            >
              {t('knowledge.create.abandonAndRead', {
                defaultValue: '放弃旧命令并重读来源'
              })}
            </button>
          </div>
          {showAbandonConfirmation ? (
            <div className="aw-inline-warning" role="alert">
              <p>
                {t('knowledge.create.abandonWarning', {
                  defaultValue:
                    '服务器可能已经创建了该来源；此操作不会撤销它，也无法通过同名来源自动判断结果。'
                })}
              </p>
              <div className="aw-inline-actions">
                <button
                  className="aw-danger-button"
                  disabled={isBusy}
                  onClick={(): void => {
                    void abandonAfterRead()
                  }}
                  type="button"
                >
                  {submission.status === 'abandoning'
                    ? t('knowledge.create.rereading', { defaultValue: '正在重读…' })
                    : t('knowledge.create.confirmAbandon', {
                        defaultValue: '确认重读并放弃旧 key'
                      })}
                </button>
                <button
                  className="aw-quiet-button"
                  disabled={isBusy}
                  onClick={(): void => setShowAbandonConfirmation(false)}
                  type="button"
                >
                  {t('common.cancel', { defaultValue: '取消' })}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {showPossibleDuplicateWarning ? (
        <div className="aw-inline-warning" role="status">
          <strong>
            {t('knowledge.create.checkDuplicate', {
              defaultValue: '请先检查列表中是否已有可能重复的手工笔记。'
            })}
          </strong>{' '}
          {t('knowledge.create.checkDuplicateHelp', {
            defaultValue: '草稿已保留；再次提交会生成一个全新的创建意图。'
          })}
        </div>
      ) : null}

      {submission.status === 'error' ? (
        <div className="aw-inline-error" role="alert">
          <strong>{t('knowledge.create.failed', { defaultValue: '创建操作未能确认。' })}</strong>{' '}
          <ResourceFailureMessage error={submission.error} />
        </div>
      ) : null}

      <form
        className="aw-knowledge-create-form"
        onSubmit={(event): void => {
          event.preventDefault()
          void submitNewIntent()
        }}
      >
        <section className="aw-card aw-card-pad">
          <div className="aw-inline-actions">
            <FilePlus2 aria-hidden="true" className="aw-accent-icon" size={19} />
            <div>
              <h2 className="aw-card-title">
                {t('knowledge.create.noteSection', { defaultValue: '笔记内容' })}
              </h2>
              <p className="aw-card-description">
                {t('knowledge.create.noteSectionHelp', {
                  defaultValue: '不会保存到浏览器本地存储、URL 或诊断事件。'
                })}
              </p>
            </div>
          </div>
          <div className="aw-editor-grid aw-editor-grid--single">
            <label className="aw-editor-field">
              <span>{t('knowledge.create.name', { defaultValue: '来源名称' })}</span>
              <input
                autoComplete="off"
                disabled={isFormLocked}
                onChange={(event): void => {
                  /** @brief 在 React 释放事件引用前复制名称 / Copy the name before React releases the event reference. */
                  const name = event.currentTarget.value
                  setValidationError(null)
                  setDraft((current) => ({ ...current, name }))
                }}
                required
                value={draft.name}
              />
            </label>
            <label className="aw-editor-field">
              <span>{t('knowledge.create.content', { defaultValue: '纯文本正文' })}</span>
              <textarea
                aria-label={t('knowledge.create.content', { defaultValue: '纯文本正文' })}
                disabled={isFormLocked}
                onChange={(event): void => {
                  /** @brief 在 React 释放事件引用前复制正文 / Copy the body before React releases the event reference. */
                  const content = event.currentTarget.value
                  setValidationError(null)
                  setDraft((current) => ({ ...current, content }))
                }}
                required
                rows={12}
                value={draft.content}
              />
              <small>
                {t('knowledge.create.contentCount', {
                  count: codePointLength(draft.content),
                  defaultValue: `${codePointLength(draft.content).toLocaleString()} / 200,000 个字符`
                })}
              </small>
            </label>
          </div>
        </section>

        <section className="aw-card aw-card-pad">
          <div className="aw-inline-actions">
            <ShieldCheck aria-hidden="true" className="aw-accent-icon" size={19} />
            <div>
              <h2 className="aw-card-title">
                {t('knowledge.create.policySection', { defaultValue: '完整可见性策略' })}
              </h2>
              <p className="aw-card-description">
                {t('knowledge.create.safePreset', {
                  defaultValue:
                    '当前值是前端提供的“安全起点”预设，不代表服务端默认：默认拒绝、仅限当前数据区域、保留 365 天。'
                })}
              </p>
            </div>
          </div>
          <VisibilityPolicyFields
            disabled={isFormLocked}
            onChange={(visibility): void => {
              setValidationError(null)
              setDraft((current) => ({ ...current, visibility }))
            }}
            value={draft.visibility}
          />
          {draft.visibility.agentGrants.length === 0 ? (
            <p className="aw-inline-warning" role="status">
              {t('knowledge.create.noAgentRules', {
                defaultValue: '当前没有 Agent grant；来源创建后暂不会被任何显式规则使用。'
              })}
            </p>
          ) : null}
        </section>

        {validationError === null ? null : (
          <div className="aw-inline-error" role="alert">
            {t(`knowledge.create.validation.${validationError}`, {
              defaultValue: validationMessage(validationError)
            })}
          </div>
        )}

        <div className="aw-inline-actions aw-form-actions">
          <button className="aw-primary-button" disabled={isFormLocked} type="submit">
            <FilePlus2 aria-hidden="true" size={15} />
            {submission.status === 'submitting'
              ? t('knowledge.create.submitting', { defaultValue: '正在创建…' })
              : t('knowledge.create.submit', { defaultValue: '创建手工笔记来源' })}
          </button>
          <Link className="aw-quiet-button" to="/knowledge">
            {t('common.cancel', { defaultValue: '取消' })}
          </Link>
        </div>
      </form>
    </div>
  )
}

/**
 * @brief 手工笔记 KnowledgeSource 创建路由页 / Manual-note KnowledgeSource creation route page.
 * @return 按 principal 与 Workspace 隔离的可恢复创建页 / Recoverable creation page isolated by principal and Workspace.
 */
export function ManualNoteCreatePage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 应用生命周期内的 Workspace 会话 / Workspace session for the application lifecycle. */
  const workspaceSession = useWorkspaceSession()
  /** @brief Workspace 或 principal 切换的隔离 revision / Isolation revision for Workspace or principal changes. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 读取会话中缓存的当前 Workspace authority / Read current Workspace authority cached in the session. */
  const loadAccess = useCallback(
    async (signal: AbortSignal): Promise<WorkspaceSessionAccess> => {
      /** @brief 当前会话权威 / Current session authority. */
      const access = await workspaceSession.getAccess()
      signal.throwIfAborted()
      return access
    },
    [workspaceSession]
  )
  /** @brief 当前 principal 与 Workspace 权威资源 / Current principal-and-Workspace authority resource. */
  const access = useAsyncResource('workspace.session', loadAccess, selectionRevision)

  if (access.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('knowledge.create.loading', {
            defaultValue: '正在准备安全创建表单…'
          })}
        />
      </div>
    )
  }
  if (access.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={access.error}
          onRetry={access.retry}
          title={t('knowledge.create.loadFailed', {
            defaultValue: '无法准备创建表单'
          })}
        />
      </div>
    )
  }

  /** @brief 当前已选择且可访问的 Workspace / Currently selected and accessible Workspace. */
  const workspace = access.data.currentWorkspaceAccess?.workspace
  if (workspace === undefined) {
    return (
      <div className="aw-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/">
              {t('knowledge.create.returnHome', { defaultValue: '返回工作区首页' })}
            </Link>
          }
          description={t('knowledge.create.workspaceRequiredHelp', {
            defaultValue: '选择一个可访问的工作区后，才能创建知识来源。'
          })}
          title={t('knowledge.create.workspaceRequired', {
            defaultValue: '需要先选择可访问的工作区'
          })}
        />
      </div>
    )
  }

  /** @brief 强制在 principal 或 Workspace 改变时丢弃组件局部草稿 / Key forcing component-local drafts to drop when principal or Workspace changes. */
  const formKey = `${access.data.currentUser.subject}:${workspace.id}`
  return <ManualNoteCreateContent access={access.data} key={formKey} workspace={workspace} />
}
