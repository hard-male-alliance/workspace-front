/** @file KnowledgeSource ETag 条件编辑页 / ETag-conditional KnowledgeSource editing page. */

import { ArrowLeft, Check, CircleAlert, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { useAsyncResource, useKnowledgeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { useUnsavedChanges } from '../../../app/UnsavedChanges'
import { requiresAuthorityReload } from '../../../app/resource-errors'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { KnowledgeGateway } from '../application/gateway'
import {
  classifyKnowledgeUpdateRecovery,
  knowledgeVisibilityPoliciesEqual,
  type UiKnowledgeUpdateConflictField
} from '../application/update-recovery'
import type { UiKnowledgeSourceAuthority, UiKnowledgeVisibilityPolicy } from '../domain/models'
import {
  validateKnowledgeVisibilityPolicy,
  VisibilityPolicyFields,
  type VisibilityPolicyValidationError
} from './VisibilityPolicyFields'

/** @brief API v2 来源名称最大 Unicode code point 数 / Maximum Unicode code points in an API v2 source name. */
const SOURCE_NAME_MAX_CODE_POINTS = 300

/** @brief 编辑页草稿 / Edit-page draft. */
interface KnowledgeSourceEditDraft {
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 完整策略 / Complete policy. */
  readonly visibility: UiKnowledgeVisibilityPolicy
}

/** @brief 编辑页客户端校验错误 / Client validation error for the edit page. */
type KnowledgeSourceEditValidationError =
  'name-required' | 'name-too-long' | VisibilityPolicyValidationError

/** @brief 已冻结更新及其恢复上下文 / Frozen update and its recovery context. */
interface FrozenKnowledgeUpdate {
  /** @brief 发出 PATCH 时的完整权威 / Complete authority when PATCH was sent. */
  readonly base: UiKnowledgeSourceAuthority
  /** @brief 最多一次自动安全重试是否仍可用 / Whether the single automatic safe retry remains available. */
  readonly automaticRetryAvailable: boolean
  /** @brief 已发送的非空 patch / Non-empty patch that was sent. */
  readonly patch: Parameters<KnowledgeGateway['updateKnowledgeSource']>[0]['patch']
}

/** @brief 编辑写入与恢复状态 / Edit-write and recovery state. */
type KnowledgeEditMutationState =
  | { readonly status: 'idle' | 'saving' | 'saved' }
  | { readonly status: 'error'; readonly error: unknown }
  | {
      readonly status: 'recovery-required' | 'reloading-authority'
      readonly error: unknown
      readonly frozen: FrozenKnowledgeUpdate
    }
  | {
      readonly status: 'conflict'
      readonly changedFields: readonly UiKnowledgeUpdateConflictField[]
      readonly frozen: FrozenKnowledgeUpdate
      readonly latest: UiKnowledgeSourceAuthority
    }

/** @brief 编辑路由的权威读取结果 / Authority-read result for the edit route. */
type KnowledgeEditAuthority =
  | { readonly kind: 'missing-source' }
  | { readonly kind: 'no-workspace' }
  | {
      readonly kind: 'source'
      readonly authority: UiKnowledgeSourceAuthority
      readonly workspaceId: UiWorkspaceId
    }

/**
 * @brief 计算 Unicode code point 数 / Count Unicode code points.
 * @param value 待计算字符串 / String to count.
 * @return 不拆分 surrogate pair 的长度 / Length without splitting surrogate pairs.
 */
function codePointLength(value: string): number {
  return [...value].length
}

/**
 * @brief 校验 KnowledgeSource 编辑草稿 / Validate a KnowledgeSource edit draft.
 * @param draft 待保存草稿 / Draft to save.
 * @return 第一项稳定错误；合法时为 null / First stable error, or null when valid.
 */
function validateDraft(draft: KnowledgeSourceEditDraft): KnowledgeSourceEditValidationError | null {
  if (draft.name.trim().length < 1) return 'name-required'
  if (codePointLength(draft.name) > SOURCE_NAME_MAX_CODE_POINTS) return 'name-too-long'
  return validateKnowledgeVisibilityPolicy(draft.visibility)
}

/**
 * @brief 映射编辑校验错误为本地安全文案 / Map an edit validation error to safe local copy.
 * @param error 稳定校验错误 / Stable validation error.
 * @return 简体中文默认文案 / Simplified-Chinese fallback copy.
 */
function validationMessage(error: KnowledgeSourceEditValidationError): string {
  /** @brief 校验错误默认文案 / Default validation copy. */
  const messages: Readonly<Record<KnowledgeSourceEditValidationError, string>> = {
    'agent-grant-limit': 'Agent 规则不能超过 100 条。',
    'agent-operation-required': '每条 Agent 规则至少需要一个适用操作，且不能重复。',
    'agent-scope-invalid': 'Agent scope 必须匹配小写 code 格式。',
    'model-region-required': '至少选择一个模型处理区域。',
    'name-required': '请输入来源名称。',
    'name-too-long': '来源名称不能超过 300 个字符。',
    'policy-version-invalid': '策略领域版本必须是正整数。',
    'retention-days-invalid': '保留天数必须是 1 到 3650，或不设置固定期限。'
  }
  return messages[error]
}

/**
 * @brief 从 base 与草稿构造最小非空 patch / Build a minimal non-empty patch from a base and draft.
 * @param base 当前权威 / Current authority.
 * @param draft 当前草稿 / Current draft.
 * @return 只包含变化字段的 patch；无变化时为 null / Patch containing only changed fields, or null without changes.
 */
function buildPatch(
  base: UiKnowledgeSourceAuthority,
  draft: KnowledgeSourceEditDraft
): Parameters<KnowledgeGateway['updateKnowledgeSource']>[0]['patch'] | null {
  /** @brief 名称是否变化 / Whether the name changed. */
  const nameChanged = draft.name !== base.source.name
  /** @brief 完整策略是否变化 / Whether the complete policy changed. */
  const visibilityChanged = !knowledgeVisibilityPoliciesEqual(
    draft.visibility,
    base.source.visibility
  )
  if (nameChanged && visibilityChanged) {
    return { name: draft.name, visibility: draft.visibility }
  }
  if (nameChanged) return { name: draft.name }
  return visibilityChanged ? { visibility: draft.visibility } : null
}

/**
 * @brief 判断最新来源是否禁止进一步编辑 / Determine whether latest source forbids further editing.
 * @param authority 最新来源权威 / Latest source authority.
 * @return 正在删除或已删除时为 true / True while deleting or after deletion.
 */
function isReadOnlyAuthority(authority: UiKnowledgeSourceAuthority): boolean {
  return (
    authority.source.ingestion.status === 'deleting' ||
    authority.source.ingestion.status === 'deleted'
  )
}

/** @brief 已加载权威的编辑内容属性 / Edit-content properties with loaded authority. */
interface KnowledgeSourceEditContentProps {
  /** @brief Knowledge application port / Knowledge application port. */
  readonly gateway: KnowledgeGateway
  /** @brief 初始 Source 与强 ETag / Initial Source and strong ETag. */
  readonly initialAuthority: UiKnowledgeSourceAuthority
  /** @brief 当前授权 Workspace / Current authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
}

/**
 * @brief 以强 ETag 编辑名称与完整策略 / Edit name and complete policy using a strong ETag.
 * @param props gateway、初始权威与 Workspace / Gateway, initial authority, and Workspace.
 * @return 含结果未知吸收、安全单次重试与显式冲突审阅的页面 / Page with unknown-result absorption, one safe retry, and explicit conflict review.
 */
function KnowledgeSourceEditContent({
  gateway,
  initialAuthority,
  workspaceId
}: KnowledgeSourceEditContentProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 最近一次已确认的完整权威 / Most recently confirmed complete authority. */
  const [base, setBase] = useState(initialAuthority)
  /** @brief 用户本地编辑草稿 / User's local edit draft. */
  const [draft, setDraft] = useState<KnowledgeSourceEditDraft>({
    name: initialAuthority.source.name,
    visibility: initialAuthority.source.visibility
  })
  /** @brief 当前 mutation 与恢复状态 / Current mutation and recovery state. */
  const [mutation, setMutation] = useState<KnowledgeEditMutationState>({ status: 'idle' })
  /** @brief 当前客户端校验错误 / Current client validation error. */
  const [validationError, setValidationError] = useState<KnowledgeSourceEditValidationError | null>(
    null
  )
  /** @brief 当前最小 patch / Current minimal patch. */
  const currentPatch = useMemo(() => buildPatch(base, draft), [base, draft])
  /** @brief 写入或权威恢复期间冻结字段 / Whether fields are locked during a write or authority recovery. */
  const isLocked =
    mutation.status === 'saving' ||
    mutation.status === 'recovery-required' ||
    mutation.status === 'reloading-authority' ||
    mutation.status === 'conflict'
  /** @brief 当前来源已进入删除只读阶段 / Whether the source entered a deletion read-only phase. */
  const isReadOnly = isReadOnlyAuthority(base)
  /** @brief 离开页面前需保护的本地草稿或恢复状态 / Local draft or recovery state protected before navigation. */
  const hasUnsavedState =
    currentPatch !== null ||
    mutation.status === 'recovery-required' ||
    mutation.status === 'reloading-authority' ||
    mutation.status === 'conflict'

  useUnsavedChanges('knowledge.source-edit', hasUnsavedState)

  /**
   * @brief 接受一个服务端确认权威并清除本地恢复状态 / Accept a service-confirmed authority and clear local recovery state.
   * @param authority 服务端确认权威 / Service-confirmed authority.
   * @param status 保存后页面状态 / Page state after acceptance.
   */
  const acceptAuthority = useCallback(
    (
      authority: UiKnowledgeSourceAuthority,
      status: Extract<KnowledgeEditMutationState['status'], 'idle' | 'saved'>
    ): void => {
      setBase(authority)
      setDraft({
        name: authority.source.name,
        visibility: authority.source.visibility
      })
      setValidationError(null)
      setMutation({ status })
    },
    []
  )

  /**
   * @brief 发送当前最小条件 patch / Send the current minimal conditional patch.
   */
  const save = useCallback(async (): Promise<void> => {
    if (isLocked || isReadOnly || currentPatch === null) return
    /** @brief 当前完整草稿的校验结果 / Validation result for the current complete draft. */
    const invalid = validateDraft(draft)
    setValidationError(invalid)
    if (invalid !== null) return
    /** @brief 与本次写入绑定的冻结上下文 / Frozen context bound to this write. */
    const frozen: FrozenKnowledgeUpdate = {
      automaticRetryAvailable: true,
      base,
      patch: currentPatch
    }
    setMutation({ status: 'saving' })
    try {
      /** @brief PATCH 返回的新权威 / New authority returned by PATCH. */
      const updated = await gateway.updateKnowledgeSource({
        concurrencyToken: base.concurrencyToken,
        patch: currentPatch,
        sourceId: base.source.id,
        workspaceId
      })
      acceptAuthority(updated, 'saved')
    } catch (error: unknown) {
      setMutation(
        requiresAuthorityReload(error)
          ? { error, frozen, status: 'recovery-required' }
          : { error, status: 'error' }
      )
    }
  }, [acceptAuthority, base, currentPatch, draft, gateway, isLocked, isReadOnly, workspaceId])

  /**
   * @brief 重读权威并吸收成功、单次安全重试或进入人工冲突 / Reread authority and absorb success, retry once safely, or enter manual conflict.
   */
  const reloadAuthority = useCallback(async (): Promise<void> => {
    if (mutation.status !== 'recovery-required') return
    /** @brief 当前冻结更新恢复上下文 / Current frozen-update recovery context. */
    const { frozen } = mutation
    setMutation({ ...mutation, status: 'reloading-authority' })
    try {
      /** @brief 单项 GET 得到的最新 Source 与强 ETag / Latest Source and strong ETag from a single-item GET. */
      const latest = await gateway.getKnowledgeSource({
        signal: new AbortController().signal,
        sourceId: frozen.base.source.id,
        workspaceId
      })
      if (isReadOnlyAuthority(latest)) {
        setMutation({ changedFields: [], frozen, latest, status: 'conflict' })
        return
      }
      /** @brief 基于冻结 base、最新权威与重试预算的恢复决策 / Recovery decision from frozen base, latest authority, and retry budget. */
      const decision = classifyKnowledgeUpdateRecovery(
        frozen.base.source,
        latest.source,
        frozen.patch,
        frozen.automaticRetryAvailable
      )
      if (decision.kind === 'confirmed') {
        acceptAuthority(latest, 'saved')
        return
      }
      if (decision.kind === 'conflict') {
        setMutation({
          changedFields: decision.changedFields,
          frozen,
          latest,
          status: 'conflict'
        })
        return
      }

      /** @brief 自动重试前以最新权威作为新 base 且耗尽预算 / New base with exhausted budget before the automatic retry. */
      const retryFrozen: FrozenKnowledgeUpdate = {
        automaticRetryAvailable: false,
        base: latest,
        patch: frozen.patch
      }
      setBase(latest)
      setMutation({ status: 'saving' })
      try {
        /** @brief 使用新强 ETag 执行的唯一自动重试结果 / Result of the sole automatic retry using the new strong ETag. */
        const retried = await gateway.updateKnowledgeSource({
          concurrencyToken: latest.concurrencyToken,
          patch: frozen.patch,
          sourceId: latest.source.id,
          workspaceId
        })
        acceptAuthority(retried, 'saved')
      } catch (retryError: unknown) {
        setMutation(
          requiresAuthorityReload(retryError)
            ? {
                error: retryError,
                frozen: retryFrozen,
                status: 'recovery-required'
              }
            : { error: retryError, status: 'error' }
        )
      }
    } catch (error: unknown) {
      setMutation({ error, frozen, status: 'recovery-required' })
    }
  }, [acceptAuthority, gateway, mutation, workspaceId])

  /**
   * @brief 放弃本地草稿并采用服务器版本 / Discard the local draft and use the server version.
   */
  const useServerVersion = useCallback((): void => {
    if (mutation.status !== 'conflict') return
    acceptAuthority(mutation.latest, 'idle')
  }, [acceptAuthority, mutation])

  /**
   * @brief 以最新 ETag 作为新 base 并保留草稿供人工检查 / Use the latest ETag as the new base while retaining the draft for review.
   */
  const reviewDraftOnLatest = useCallback((): void => {
    if (mutation.status !== 'conflict') return
    setBase(mutation.latest)
    setMutation({ status: 'idle' })
  }, [mutation])

  if (isReadOnly) {
    return (
      <div className="aw-page">
        <div className="aw-page-header">
          <div>
            <p className="aw-eyebrow">
              {t('knowledge.edit.eyebrow', { defaultValue: '来源设置' })}
            </p>
            <h1 className="aw-page-title">{base.source.name}</h1>
          </div>
          <Link className="aw-quiet-button" to={`/knowledge/${base.source.id}`}>
            <ArrowLeft aria-hidden="true" size={15} />
            {t('knowledge.edit.backToDetail', { defaultValue: '返回来源详情' })}
          </Link>
        </div>
        <EmptyState
          description={t('knowledge.edit.readOnlyDescription', {
            defaultValue: '删除阶段不接受新的名称或策略写入。请返回详情读取最新权威状态。'
          })}
          title={
            base.source.ingestion.status === 'deleting'
              ? t('knowledge.edit.deletingTitle', { defaultValue: '来源正在删除' })
              : t('knowledge.edit.deletedTitle', { defaultValue: '来源已删除' })
          }
        />
      </div>
    )
  }

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('knowledge.edit.eyebrow', { defaultValue: 'ETag 条件更新' })}
          </p>
          <h1 className="aw-page-title">
            {t('knowledge.edit.title', { defaultValue: '编辑知识来源' })}
          </h1>
          <p className="aw-page-description">
            {t('knowledge.edit.description', {
              defaultValue:
                '仅提交变化字段；完整可见性策略使用读取时配对的强 ETag 保存，避免覆盖其他位置的更新。'
            })}
          </p>
        </div>
        <Link className="aw-quiet-button" to={`/knowledge/${base.source.id}`}>
          <ArrowLeft aria-hidden="true" size={15} />
          {t('knowledge.edit.backToDetail', { defaultValue: '返回来源详情' })}
        </Link>
      </div>

      {mutation.status === 'saved' ? (
        <div aria-live="polite" className="aw-proposal" role="status">
          <p className="aw-proposal-title">
            <Check aria-hidden="true" size={14} />
            {t('knowledge.edit.saved', { defaultValue: '来源设置已由服务端确认' })}
          </p>
        </div>
      ) : null}

      {mutation.status === 'error' ? (
        <div className="aw-inline-error" role="alert">
          <strong>{t('knowledge.edit.saveFailed', { defaultValue: '无法保存来源设置。' })}</strong>{' '}
          <ResourceFailureMessage error={mutation.error} />
        </div>
      ) : null}

      {mutation.status === 'recovery-required' || mutation.status === 'reloading-authority' ? (
        <section className="aw-card aw-card-pad aw-recovery-card">
          <div className="aw-inline-actions">
            <CircleAlert aria-hidden="true" className="aw-warning-icon" size={19} />
            <div>
              <h2 className="aw-card-title">
                {t('knowledge.edit.recoveryTitle', {
                  defaultValue: '必须先读取最新权威来源'
                })}
              </h2>
              <p className="aw-card-description">
                {t('knowledge.edit.recoveryDescription', {
                  defaultValue:
                    '保存结果未知或 ETag 已失效。页面不会盲目重发；重读后若权威已匹配则吸收成功，仅在触及字段未变化时自动安全重试一次。'
                })}
              </p>
            </div>
          </div>
          <p className="aw-inline-error">
            <ResourceFailureMessage error={mutation.error} />
          </p>
          <button
            className="aw-primary-button"
            disabled={mutation.status === 'reloading-authority'}
            onClick={(): void => {
              void reloadAuthority()
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
            {mutation.status === 'reloading-authority'
              ? t('knowledge.edit.reloading', { defaultValue: '正在读取最新权威…' })
              : t('knowledge.edit.reload', { defaultValue: '读取最新权威并恢复' })}
          </button>
        </section>
      ) : null}

      {mutation.status === 'conflict' ? (
        <section className="aw-card aw-card-pad aw-recovery-card" role="alert">
          <div className="aw-inline-actions">
            <CircleAlert aria-hidden="true" className="aw-warning-icon" size={19} />
            <div>
              <h2 className="aw-card-title">
                {t('knowledge.edit.conflictTitle', {
                  defaultValue: '需要检查服务器版本与本地草稿'
                })}
              </h2>
              <p className="aw-card-description">
                {mutation.changedFields.length === 0
                  ? t('knowledge.edit.retryBudgetExhausted', {
                      defaultValue:
                        '自动安全重试已经使用，仍无法确认结果。请显式选择服务器版本，或基于最新 ETag 检查草稿。'
                    })
                  : t('knowledge.edit.conflictFields', {
                      defaultValue: `其他位置修改了：${mutation.changedFields
                        .map((field) => (field === 'name' ? '名称' : '可见性策略'))
                        .join('、')}。页面不会自动合并完整策略。`,
                      fields: mutation.changedFields
                        .map((field) => (field === 'name' ? '名称' : '可见性策略'))
                        .join('、')
                    })}
              </p>
            </div>
          </div>
          <div className="aw-inline-actions">
            <button className="aw-quiet-button" onClick={useServerVersion} type="button">
              {t('knowledge.edit.useServer', { defaultValue: '使用服务器版本' })}
            </button>
            <button className="aw-primary-button" onClick={reviewDraftOnLatest} type="button">
              {t('knowledge.edit.reviewDraft', {
                defaultValue: '基于最新版本检查我的草稿'
              })}
            </button>
          </div>
        </section>
      ) : null}

      <form
        className="aw-knowledge-edit-form"
        onSubmit={(event): void => {
          event.preventDefault()
          void save()
        }}
      >
        <section className="aw-card aw-card-pad">
          <label className="aw-editor-field">
            <span>{t('knowledge.edit.name', { defaultValue: '来源名称' })}</span>
            <input
              aria-label={t('knowledge.edit.name', { defaultValue: '来源名称' })}
              autoComplete="off"
              disabled={isLocked}
              onChange={(event): void => {
                /** @brief 在 React 释放事件引用前复制名称 / Copy the name before React releases the event reference. */
                const name = event.currentTarget.value
                setValidationError(null)
                setMutation({ status: 'idle' })
                setDraft((current) => ({ ...current, name }))
              }}
              required
              value={draft.name}
            />
            <small>
              {t('knowledge.edit.nameCount', {
                count: codePointLength(draft.name),
                defaultValue: `${codePointLength(draft.name)} / 300 个字符`
              })}
            </small>
          </label>
        </section>

        <section className="aw-card aw-card-pad">
          <div className="aw-inline-actions">
            <ShieldCheck aria-hidden="true" className="aw-accent-icon" size={19} />
            <div>
              <h2 className="aw-card-title">
                {t('knowledge.edit.policy', { defaultValue: '完整字面策略' })}
              </h2>
              <p className="aw-card-description">
                {t('knowledge.edit.policyHelp', {
                  defaultValue:
                    '所有字段都会按当前值整体替换；不合并重复 scope，也不计算任何 Agent 的最终访问结果。'
                })}
              </p>
            </div>
          </div>
          <VisibilityPolicyFields
            disabled={isLocked}
            onChange={(visibility): void => {
              setValidationError(null)
              setMutation({ status: 'idle' })
              setDraft((current) => ({ ...current, visibility }))
            }}
            value={draft.visibility}
          />
        </section>

        {validationError === null ? null : (
          <div className="aw-inline-error" role="alert">
            {t(`knowledge.edit.validation.${validationError}`, {
              defaultValue: validationMessage(validationError)
            })}
          </div>
        )}

        <div className="aw-inline-actions aw-form-actions">
          <button
            className="aw-primary-button"
            disabled={isLocked || currentPatch === null}
            type="submit"
          >
            <Save aria-hidden="true" size={15} />
            {mutation.status === 'saving'
              ? t('knowledge.edit.saving', { defaultValue: '正在保存…' })
              : t('common.save', { defaultValue: '保存' })}
          </button>
          <Link className="aw-quiet-button" to={`/knowledge/${base.source.id}`}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Link>
        </div>
      </form>
    </div>
  )
}

/**
 * @brief KnowledgeSource 编辑路由页 / KnowledgeSource edit route page.
 * @return Workspace-scoped 单项 GET 与强 ETag 编辑页 / Workspace-scoped single-item GET and strong-ETag edit page.
 */
export function KnowledgeSourceEditPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由中的来源 identity / Source identity from the route. */
  const { sourceId } = useParams()
  /** @brief Knowledge application port / Knowledge application port. */
  const gateway = useKnowledgeGateway()
  /** @brief 当前 Workspace 会话 / Current Workspace session. */
  const workspaceSession = useWorkspaceSession()
  /** @brief Workspace/principal 隔离 revision / Workspace/principal isolation revision. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 路由 identity 的名义类型；缺失时为 null / Nominal route identity, or null when missing. */
  const requestedSourceId = useMemo(
    () => (sourceId === undefined ? null : asUiOpaqueId<'knowledge-source'>(sourceId)),
    [sourceId]
  )
  /** @brief 读取当前 Workspace 内单项权威的稳定 loader / Stable loader reading one authority in the current Workspace. */
  const loadAuthority = useCallback(
    async (signal: AbortSignal): Promise<KnowledgeEditAuthority> => {
      if (requestedSourceId === null) return { kind: 'missing-source' }
      /** @brief 当前已选择 Workspace / Currently selected Workspace. */
      const workspace = await workspaceSession.getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspace === undefined) return { kind: 'no-workspace' }
      /** @brief 单项 GET 与同响应强 ETag / Single-item GET and strong ETag from the same response. */
      const authority = await gateway.getKnowledgeSource({
        signal,
        sourceId: requestedSourceId,
        workspaceId: workspace.id
      })
      signal.throwIfAborted()
      return { authority, kind: 'source', workspaceId: workspace.id }
    },
    [gateway, requestedSourceId, workspaceSession]
  )
  /** @brief 当前来源编辑权威资源 / Current source-edit authority resource. */
  const authority = useAsyncResource(
    'knowledge.source',
    loadAuthority,
    `${selectionRevision}:${requestedSourceId ?? 'missing'}`
  )

  if (authority.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('knowledge.edit.loading', { defaultValue: '正在加载来源设置…' })} />
      </div>
    )
  }
  if (authority.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={authority.error}
          onRetry={authority.retry}
          title={t('knowledge.edit.loadFailed', { defaultValue: '无法加载来源设置' })}
        />
      </div>
    )
  }
  if (authority.data.kind !== 'source') {
    return (
      <div className="aw-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/knowledge">
              {t('common.back', { defaultValue: '返回知识库' })}
            </Link>
          }
          description={
            authority.data.kind === 'no-workspace'
              ? t('knowledge.edit.noWorkspaceHelp', {
                  defaultValue: '选择一个可访问的工作区后再编辑来源。'
                })
              : t('knowledge.edit.missingSourceHelp', {
                  defaultValue: '当前地址没有包含可读取的来源 identity。'
                })
          }
          title={
            authority.data.kind === 'no-workspace'
              ? t('knowledge.edit.noWorkspace', { defaultValue: '未选择工作区' })
              : t('knowledge.edit.missingSource', { defaultValue: '缺少来源 identity' })
          }
        />
      </div>
    )
  }

  return (
    <KnowledgeSourceEditContent
      gateway={gateway}
      initialAuthority={authority.data.authority}
      key={`${authority.data.workspaceId}:${authority.data.authority.source.id}`}
      workspaceId={authority.data.workspaceId}
    />
  )
}
