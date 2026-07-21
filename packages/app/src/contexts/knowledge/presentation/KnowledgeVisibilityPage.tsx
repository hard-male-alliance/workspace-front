import {
  ArrowLeft,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  LockKeyhole,
  Save,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAsyncResource, useKnowledgeGateway } from '../../../app/AppData'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import type { UiAgentScope } from '../../../shared-kernel/agent-scope'
import { ErrorState, LoadingState } from '../../../ui'
import type {
  UiKnowledgeOperation,
  UiKnowledgeSensitivity,
  UiKnowledgeVisibilityModel,
  UiVisibilityEffect
} from '../domain/models'

/** @brief 可见性矩阵中的操作列 / Operation column in the visibility matrix. */
interface VisibilityOperationColumn {
  /** @brief 操作标识符 / Operation identifier. */
  readonly operation: UiKnowledgeOperation
  /** @brief 本地化 key / Localization key. */
  readonly labelKey: string
  /** @brief 默认标签 / Default label. */
  readonly defaultLabel: string
}

/** @brief 可见性矩阵的操作列定义 / Operation columns for the visibility matrix. */
const visibilityOperationColumns: readonly VisibilityOperationColumn[] = [
  { operation: 'retrieve', labelKey: 'visibility.retrieve', defaultLabel: '检索' },
  { operation: 'quote', labelKey: 'visibility.quote', defaultLabel: '引用原文' },
  { operation: 'summarize', labelKey: 'visibility.summarize', defaultLabel: '摘要' },
  { operation: 'derive', labelKey: 'visibility.derive', defaultLabel: '推理依据' },
  { operation: 'write_back', labelKey: 'visibility.writeBack', defaultLabel: '写回来源' }
]

/**
 * @brief 格式化 Agent scope 名称 / Format an Agent scope name.
 * @param scope Agent scope 标识 / Agent scope identifier.
 * @return 用户可见名称 / User-visible name.
 */
function getAgentScopeLabelKey(scope: UiAgentScope): string {
  /** @brief scope 翻译键表 / Scope translation-key table. */
  const labelKeys: Readonly<Record<UiAgentScope, string>> = {
    resume_assistant: 'visibility.scopes.resumeAssistant',
    job_fit_analyst: 'visibility.scopes.jobFitAnalyst',
    interview_agent: 'visibility.scopes.interviewAgent',
    interview_reporter: 'visibility.scopes.interviewReporter',
    general_chat: 'visibility.scopes.generalChat',
    portfolio_assistant: 'visibility.scopes.portfolioAssistant'
  }
  return labelKeys[scope]
}

/**
 * @brief 将可见性效果映射为本地化资源 key / Map a visibility effect to a localization resource key.
 * @param effect 可见性效果 / Visibility effect.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getVisibilityEffectLabelKey(effect: UiVisibilityEffect): string {
  /** @brief 可见性效果到资源 key 的映射 / Mapping from visibility effect to resource key. */
  const labelKeys: Readonly<Record<UiVisibilityEffect, string>> = {
    allow: 'visibility.effects.allow',
    deny: 'visibility.effects.deny'
  }
  return labelKeys[effect]
}

/**
 * @brief 将敏感度映射为本地化资源 key / Map a sensitivity to a localization resource key.
 * @param sensitivity 知识来源敏感度 / Knowledge-source sensitivity.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getSensitivityLabelKey(sensitivity: UiKnowledgeSensitivity): string {
  /** @brief 敏感度到资源 key 的映射 / Mapping from sensitivity to resource key. */
  const labelKeys: Readonly<Record<UiKnowledgeSensitivity, string>> = {
    normal: 'visibility.sensitivity.normal',
    confidential: 'visibility.sensitivity.confidential',
    highly_confidential: 'visibility.sensitivity.highlyConfidential'
  }
  return labelKeys[sensitivity]
}

/**
 * @brief 将模型区域映射为本地化资源 key / Map a model-data region to a localization resource key.
 * @param region 模型数据区域 / Model-data region.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getRegionLabelKey(
  region: UiKnowledgeVisibilityModel['source']['visibility']['allowedModelRegions'][number]
): string {
  /** @brief 数据区域到资源 key 的映射 / Mapping from data region to resource key. */
  const labelKeys: Readonly<
    Record<
      UiKnowledgeVisibilityModel['source']['visibility']['allowedModelRegions'][number],
      string
    >
  > = {
    cn: 'visibility.regions.cn',
    global: 'visibility.regions.global',
    private_deployment: 'visibility.regions.privateDeployment'
  }
  return labelKeys[region]
}

/**
 * @brief 判断某 Agent 是否具有指定操作 / Check whether an Agent has a given operation.
 * @param model 可见性页面模型 / Visibility-page model.
 * @param scope Agent scope / Agent scope.
 * @param operation 知识操作 / Knowledge operation.
 * @return 授权允许该操作时为 true / True when the grant allows the operation.
 */
function isOperationAllowed(
  model: UiKnowledgeVisibilityModel,
  scope: UiAgentScope,
  operation: UiKnowledgeOperation
): boolean {
  /** @brief 匹配的授权条目 / Matching grant entry. */
  const grant = model.source.visibility.agentGrants.find(
    (candidate) => candidate.agentScope === scope
  )
  return grant?.effect === 'allow' && grant.allowedOperations.includes(operation)
}

/**
 * @brief 输出可见性矩阵的一行 / Render one row of the visibility matrix.
 * @param props 可见性模型与 Agent scope / Visibility model and Agent scope.
 * @return 含可读单元格语义的表格行 / Table row with readable cell semantics.
 */
function VisibilityMatrixRow({
  model,
  scope
}: {
  readonly model: UiKnowledgeVisibilityModel
  readonly scope: UiAgentScope
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前 Agent scope 的本地化标签 / Localized label for the current Agent scope. */
  const scopeLabel = t(getAgentScopeLabelKey(scope), { defaultValue: scope })

  return (
    <tr>
      <td>{scopeLabel}</td>
      {visibilityOperationColumns.map((column) => {
        /** @brief 当前操作是否显式允许 / Whether the current operation is explicitly allowed. */
        const allowed = isOperationAllowed(model, scope, column.operation)
        /** @brief 当前操作的本地化标签 / Localized label for the current operation. */
        const operationLabel = t(column.labelKey, { defaultValue: column.defaultLabel })
        /** @brief 当前效果的本地化标签 / Localized label for the current effect. */
        const effectLabel = allowed
          ? t('visibility.allow', { defaultValue: 'Allow' })
          : t('visibility.deny', { defaultValue: 'Deny' })
        return (
          <td key={column.operation}>
            <span
              aria-label={t('visibility.matrixCell', {
                scope: scopeLabel,
                operation: operationLabel,
                effect: effectLabel,
                defaultValue: `${scopeLabel}: ${operationLabel} is ${effectLabel}`
              })}
              className={`aw-check ${allowed ? '' : 'aw-check--off'}`}
              role="img"
            >
              <Check aria-hidden="true" size={12} />
            </span>
          </td>
        )
      })}
    </tr>
  )
}

/**
 * @brief 已就绪的可见性设置页面 / Ready visibility-settings page.
 * @param props 可见性模型 / Visibility model.
 * @return 明确 default-deny 语义的可见性配置页 / Visibility configuration page with explicit default-deny semantics.
 */
function KnowledgeVisibilityContent({
  model
}: {
  readonly model: UiKnowledgeVisibilityModel
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 是否允许会话级选择的本地草稿 / Local draft for allowing session selection. */
  const [sessionOverrideAllowed, setSessionOverrideAllowed] = useState(
    model.source.visibility.sessionOverrideAllowed
  )
  /** @brief 是否允许外部模型的本地草稿 / Local draft for allowing external models. */
  const [externalModelAllowed, setExternalModelAllowed] = useState(
    model.source.visibility.allowExternalModelProcessing
  )
  /** @brief 是否显示保存后的 Mock 状态 / Whether to show post-save Mock status. */
  const [isMockSaved, setMockSaved] = useState(false)
  /** @brief 显式允许的 Agent 授权数量 / Count of explicitly allowed agent grants. */
  const allowedGrantCount = model.source.visibility.agentGrants.filter(
    (grant) => grant.effect === 'allow'
  ).length

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{t('visibility.defaultDeny', { defaultValue: '默认拒绝' })}</p>
          <h1 className="aw-page-title">
            {t('visibility.title', { defaultValue: 'Agent 可见性' })}
          </h1>
          <p className="aw-page-description">
            {t('visibility.description', {
              defaultValue:
                '为“来源”设置最小授权；最终 EffectiveAccess 仍由后端结合会话选择做 deny 优先判定。'
            })}
          </p>
        </div>
        <div className="aw-inline-actions">
          <Link className="aw-quiet-button" to="/knowledge">
            <ArrowLeft aria-hidden="true" size={15} />
            {t('common.back', { defaultValue: '返回知识库' })}
          </Link>
          <button
            className="aw-primary-button"
            onClick={(): void => setMockSaved(true)}
            type="button"
          >
            <Save aria-hidden="true" size={15} />
            {t('common.save', { defaultValue: '保存草稿' })}
          </button>
        </div>
      </div>

      {isMockSaved ? (
        <div aria-live="polite" className="aw-proposal" style={{ marginBottom: 18 }}>
          <p className="aw-proposal-title">
            <Check
              aria-hidden="true"
              size={14}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('visibility.mockSaved', { defaultValue: '已保存到本地演示状态' })}
          </p>
          <p className="aw-muted" style={{ margin: 0 }}>
            {t('visibility.mockSavedDescription', {
              defaultValue: '没有发出 PATCH，也没有改变后端权威策略。'
            })}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="visibility-overview-title" className="aw-visibility-summary">
        <div>
          <p className="aw-sidebar-label">
            {t('visibility.overviewLabel', { defaultValue: '权限概览' })}
          </p>
          <h2 id="visibility-overview-title">{model.source.name}</h2>
        </div>
        <div className="aw-visibility-summary-stats">
          <span>
            <strong>{allowedGrantCount}</strong>
            {t('visibility.allowedAgents', { defaultValue: '个 Agent 已明确授权' })}
          </span>
          <span>
            <strong>{model.source.visibility.allowedModelRegions.length}</strong>
            {t('visibility.regionCount', { defaultValue: '个允许区域' })}
          </span>
          <span className="aw-status aw-status--active">
            {t('visibility.defaultDeny', { defaultValue: '默认拒绝' })}
          </span>
        </div>
      </section>

      <div className="aw-visibility-grid">
        <section className="aw-card aw-card-pad" aria-labelledby="visibility-source-title">
          <div className="aw-inline-actions">
            <ShieldCheck aria-hidden="true" className="aw-accent-icon" size={19} />
            <div>
              <h2 className="aw-card-title" id="visibility-source-title">
                {model.source.name}
              </h2>
              <p className="aw-card-description">{model.source.originLabel}</p>
            </div>
          </div>
          <div className="aw-list-row">
            <span className="aw-muted">
              {t('visibility.policyVersion', {
                version: model.source.visibility.policyVersion,
                defaultValue: `策略版本 ${model.source.visibility.policyVersion}`
              })}
            </span>
            <span className="aw-status aw-status--active">
              {t(getSensitivityLabelKey(model.source.visibility.sensitivity), {
                defaultValue: model.source.visibility.sensitivity
              })}
            </span>
          </div>
          <div className="aw-list-row">
            <span className="aw-muted">
              {t('visibility.defaultEffect', { defaultValue: '默认效果' })}
            </span>
            <span className="aw-status aw-status--active">
              {model.source.visibility.defaultEffect === 'deny' ? (
                <EyeOff aria-hidden="true" size={12} style={{ marginRight: 4 }} />
              ) : (
                <Eye aria-hidden="true" size={12} style={{ marginRight: 4 }} />
              )}
              {t(getVisibilityEffectLabelKey(model.source.visibility.defaultEffect), {
                defaultValue: model.source.visibility.defaultEffect
              })}
            </span>
          </div>
          <div className="aw-list-row">
            <span className="aw-muted">
              {t('visibility.allowedRegions', { defaultValue: '允许的数据区域' })}
            </span>
            <div className="aw-chip-row">
              {model.source.visibility.allowedModelRegions.map((region) => (
                <span className="aw-chip" key={region}>
                  {t(getRegionLabelKey(region), { defaultValue: region })}
                </span>
              ))}
            </div>
          </div>
          <p className="aw-setting-help" style={{ marginBottom: 0 }}>
            <LockKeyhole
              aria-hidden="true"
              size={13}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('visibility.pendingNotice', {
              defaultValue: '当前页面为只读 Mock；最终授权仍由后端按 EffectiveAccess 判定。'
            })}
          </p>
        </section>

        <aside className="aw-card aw-settings-card">
          <div className="aw-inline-actions">
            <SlidersHorizontal aria-hidden="true" className="aw-accent-icon" size={18} />
            <div>
              <h2 className="aw-card-title">
                {t('visibility.sessionControls', { defaultValue: '会话与模型控制' })}
              </h2>
              <p className="aw-card-description">
                {t('visibility.draftOnly', { defaultValue: '以下调整仅在此 Mock 页面生效。' })}
              </p>
            </div>
          </div>
          <div className="aw-setting-row">
            <div>
              <p className="aw-setting-label">
                {t('visibility.sessionOverride', { defaultValue: '允许会话级选择' })}
              </p>
              <p className="aw-setting-help">
                {t('visibility.sessionOverrideHelp', {
                  defaultValue: '允许用户在单次 Agent Run 中临时排除或显式选择来源。'
                })}
              </p>
            </div>
            <button
              aria-checked={sessionOverrideAllowed}
              aria-label={t('visibility.sessionOverride', { defaultValue: '允许会话级选择' })}
              className="aw-switch"
              onClick={(): void => setSessionOverrideAllowed((value) => !value)}
              role="switch"
              type="button"
            />
          </div>
          <div className="aw-setting-row">
            <div>
              <p className="aw-setting-label">
                {t('visibility.externalModel', { defaultValue: '允许外部模型处理' })}
              </p>
              <p className="aw-setting-help">
                {t('visibility.externalModelHelp', {
                  defaultValue: '默认关闭；真实实现需要服务端策略、区域和审计校验。'
                })}
              </p>
            </div>
            <button
              aria-checked={externalModelAllowed}
              aria-label={t('visibility.externalModel', { defaultValue: '允许外部模型处理' })}
              className="aw-switch"
              onClick={(): void => setExternalModelAllowed((value) => !value)}
              role="switch"
              type="button"
            />
          </div>
        </aside>
      </div>

      <section
        aria-labelledby="visibility-matrix-title"
        className="aw-card aw-card-pad"
        style={{ marginTop: 18 }}
      >
        <div className="aw-inline-actions">
          <Eye aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title" id="visibility-matrix-title">
              {t('visibility.operations', { defaultValue: '按 Agent 作用域授权' })}
            </h2>
            <p className="aw-card-description">
              {t('visibility.matrixDescription', {
                defaultValue: '只有明确 allow 的操作可用；没有 grant 不等于继承允许。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-policy-matrix" style={{ marginTop: 14 }}>
          <table className="aw-policy-table">
            <thead>
              <tr>
                <th scope="col">{t('visibility.agentScope', { defaultValue: 'Agent' })}</th>
                {visibilityOperationColumns.map((column) => (
                  <th key={column.operation} scope="col">
                    {t(column.labelKey, { defaultValue: column.defaultLabel })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.availableAgentScopes.map((scope) => (
                <VisibilityMatrixRow key={scope} model={model} scope={scope} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aw-card aw-card-pad" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions">
          <CircleAlert aria-hidden="true" className="aw-warning-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('visibility.beforeProduction', { defaultValue: '接入前仍待确认' })}
            </h2>
            <p className="aw-card-description">
              {t('visibility.beforeProductionDescription', {
                defaultValue:
                  'PATCH、策略解释、会话审计快照和 EffectiveAccess 计算均不会在前端自行臆造。'
              })}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * @brief 知识可见性路由页 / Knowledge-visibility route page.
 * @return 含 loading、error 与可见性设置的路由页 / Route page with loading, error, and visibility settings.
 */
export function KnowledgeVisibilityPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由参数 / Route parameters. */
  const { sourceId } = useParams()
  /** @brief 知识库 gateway / Knowledge gateway. */
  const knowledge = useKnowledgeGateway()
  /** @brief 路由 ID 的不透明 UI 表达 / Opaque UI representation of route ID. */
  const requestedSourceId = useMemo(
    () => asUiOpaqueId<'knowledge-source'>(sourceId ?? ''),
    [sourceId]
  )
  /** @brief 稳定的可见性加载器 / Stable visibility loader. */
  const loadVisibility = useCallback(async (): Promise<UiKnowledgeVisibilityModel> => {
    if (sourceId === undefined) {
      throw new Error('A knowledge source identifier is required.')
    }

    return knowledge.getKnowledgeVisibility(requestedSourceId)
  }, [knowledge, requestedSourceId, sourceId])
  /** @brief 可见性异步资源 / Visibility async resource. */
  const visibility = useAsyncResource('knowledge.visibility', loadVisibility)

  if (visibility.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('status.loadingVisibility', { defaultValue: '正在加载知识可见性…' })}
        />
      </div>
    )
  }

  if (visibility.status === 'error') {
    return (
      <div className="aw-page">
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue:
              'Demo data is temporarily unavailable. Try again or return to the workspace.'
          })}
          title={t('status.errorVisibility', { defaultValue: '无法加载知识可见性' })}
        />
      </div>
    )
  }

  return <KnowledgeVisibilityContent model={visibility.data} />
}
