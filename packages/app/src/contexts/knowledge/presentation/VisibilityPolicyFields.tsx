/** @file Knowledge 可见性策略完整表单 / Complete Knowledge visibility-policy form. */

import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { UiWorkspaceDataRegion } from '../../workspace'
import type {
  UiAgentScopeGrant,
  UiKnowledgeModelRegion,
  UiKnowledgeOperation,
  UiKnowledgeVisibilityPolicy,
  UiVisibilityEffect
} from '../domain/models'

/** @brief API v2 可授权的全部 Knowledge 操作 / All Knowledge operations grantable by API v2. */
const KNOWLEDGE_OPERATIONS: readonly UiKnowledgeOperation[] = [
  'retrieve',
  'quote',
  'summarize',
  'derive',
  'write_back'
]

/** @brief API v2 可选的全部模型处理区域 / All model-processing regions available in API v2. */
const KNOWLEDGE_MODEL_REGIONS: readonly UiKnowledgeModelRegion[] = [
  'cn',
  'global',
  'private_deployment'
]

/** @brief Agent scope 的 canonical 开放枚举格式 / Canonical open-enum format for an Agent scope. */
const AGENT_SCOPE_PATTERN = /^[a-z][a-z0-9_.-]{2,100}$/u

/** @brief 完整策略表单属性 / Complete-policy form properties. */
export interface VisibilityPolicyFieldsProps {
  /** @brief 当前完整策略草稿 / Current complete policy draft. */
  readonly value: UiKnowledgeVisibilityPolicy
  /** @brief 是否冻结全部策略字段 / Whether every policy field is locked. */
  readonly disabled?: boolean
  /** @brief 策略草稿变化通知 / Policy-draft change notification. */
  readonly onChange: (value: UiKnowledgeVisibilityPolicy) => void
}

/** @brief 策略表单的稳定校验错误 / Stable validation error for the policy form. */
export type VisibilityPolicyValidationError =
  | 'agent-grant-limit'
  | 'agent-operation-required'
  | 'agent-scope-invalid'
  | 'model-region-required'
  | 'policy-version-invalid'
  | 'retention-days-invalid'

/**
 * @brief 构造明确标注的安全表单起点 / Construct an explicitly labelled safe form starting point.
 * @param dataRegion 当前 Workspace 的数据驻留区域 / Data-residency region of the current Workspace.
 * @return 默认拒绝、无 Agent grant 的完整策略 / Complete default-deny policy without Agent grants.
 * @note 这是前端产品预设，不冒充服务端默认值 / This is a frontend product preset, not a claimed service default.
 */
export function createSafeKnowledgeVisibilityPolicy(
  dataRegion: UiWorkspaceDataRegion
): UiKnowledgeVisibilityPolicy {
  return {
    agentGrants: [],
    allowExternalModelProcessing: false,
    allowedModelRegions: [dataRegion],
    defaultEffect: 'deny',
    policyVersion: 1,
    retentionDays: 365,
    sensitivity: 'confidential',
    sessionOverrideAllowed: false
  }
}

/**
 * @brief 校验完整 Knowledge visibility 草稿 / Validate a complete Knowledge visibility draft.
 * @param policy 待提交策略 / Policy to submit.
 * @return 第一项稳定错误；合法时为 null / First stable error, or null when valid.
 */
export function validateKnowledgeVisibilityPolicy(
  policy: UiKnowledgeVisibilityPolicy
): VisibilityPolicyValidationError | null {
  if (policy.agentGrants.length > 100) return 'agent-grant-limit'
  for (const grant of policy.agentGrants) {
    if (!AGENT_SCOPE_PATTERN.test(grant.agentScope)) return 'agent-scope-invalid'
    if (
      grant.allowedOperations.length < 1 ||
      new Set(grant.allowedOperations).size !== grant.allowedOperations.length
    ) {
      return 'agent-operation-required'
    }
  }
  if (
    policy.allowedModelRegions.length < 1 ||
    new Set(policy.allowedModelRegions).size !== policy.allowedModelRegions.length
  ) {
    return 'model-region-required'
  }
  if (
    policy.retentionDays !== null &&
    (!Number.isSafeInteger(policy.retentionDays) ||
      policy.retentionDays < 1 ||
      policy.retentionDays > 3650)
  ) {
    return 'retention-days-invalid'
  }
  return !Number.isSafeInteger(policy.policyVersion) || policy.policyVersion < 1
    ? 'policy-version-invalid'
    : null
}

/**
 * @brief 映射操作的本地化默认标签 / Map an operation to its localized fallback label.
 * @param operation Knowledge 操作 / Knowledge operation.
 * @return 简体中文默认标签 / Simplified-Chinese fallback label.
 */
function operationLabel(operation: UiKnowledgeOperation): string {
  /** @brief 操作标签表 / Operation-label table. */
  const labels: Readonly<Record<UiKnowledgeOperation, string>> = {
    derive: '推理依据',
    quote: '引用原文',
    retrieve: '检索',
    summarize: '摘要',
    write_back: '写回来源'
  }
  return labels[operation]
}

/**
 * @brief 以原序更新单条 Agent grant / Update one Agent grant in its original position.
 * @param policy 当前完整策略 / Current complete policy.
 * @param index grant 原始位置 / Original grant position.
 * @param grant 替换 grant / Replacement grant.
 * @return 未重排其他规则的新策略 / New policy without reordering other rules.
 */
function replaceGrant(
  policy: UiKnowledgeVisibilityPolicy,
  index: number,
  grant: UiAgentScopeGrant
): UiKnowledgeVisibilityPolicy {
  return {
    ...policy,
    agentGrants: policy.agentGrants.map((candidate, candidateIndex) =>
      candidateIndex === index ? grant : candidate
    )
  }
}

/**
 * @brief 渲染 Knowledge 可见性策略的全部字段 / Render every Knowledge visibility-policy field.
 * @param props 受控策略、锁定状态与更新通知 / Controlled policy, lock state, and update notification.
 * @return 不计算 effective access 的字面策略编辑器 / Literal policy editor that never calculates effective access.
 */
export function VisibilityPolicyFields({
  disabled = false,
  onChange,
  value
}: VisibilityPolicyFieldsProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()

  return (
    <div className="aw-visibility-form">
      <div className="aw-editor-grid">
        <label className="aw-editor-field">
          <span>{t('visibility.sensitivityLabel', { defaultValue: '敏感等级' })}</span>
          <select
            disabled={disabled}
            onChange={(event): void => {
              onChange({
                ...value,
                sensitivity: event.currentTarget.value as UiKnowledgeVisibilityPolicy['sensitivity']
              })
            }}
            value={value.sensitivity}
          >
            <option value="normal">
              {t('visibility.sensitivity.normal', { defaultValue: '普通' })}
            </option>
            <option value="confidential">
              {t('visibility.sensitivity.confidential', { defaultValue: '机密' })}
            </option>
            <option value="highly_confidential">
              {t('visibility.sensitivity.highlyConfidential', {
                defaultValue: '高度机密'
              })}
            </option>
          </select>
        </label>

        <label className="aw-editor-field">
          <span>{t('visibility.defaultEffect', { defaultValue: '未匹配规则时' })}</span>
          <select
            disabled={disabled}
            onChange={(event): void => {
              onChange({
                ...value,
                defaultEffect: event.currentTarget.value as UiVisibilityEffect
              })
            }}
            value={value.defaultEffect}
          >
            <option value="deny">{t('visibility.effects.deny', { defaultValue: '拒绝' })}</option>
            <option value="allow">{t('visibility.effects.allow', { defaultValue: '允许' })}</option>
          </select>
        </label>

        <label className="aw-editor-field">
          <span>{t('visibility.policyVersionLabel', { defaultValue: '策略领域版本' })}</span>
          <input
            disabled={disabled}
            inputMode="numeric"
            min={1}
            onChange={(event): void => {
              onChange({
                ...value,
                policyVersion: event.currentTarget.valueAsNumber
              })
            }}
            step={1}
            type="number"
            value={value.policyVersion}
          />
          <small>
            {t('visibility.policyVersionHelp', {
              defaultValue: '这是策略模型版本，不是 HTTP ETag。'
            })}
          </small>
        </label>

        <label className="aw-editor-field">
          <span>{t('visibility.retentionDays', { defaultValue: '保留天数' })}</span>
          <input
            disabled={disabled || value.retentionDays === null}
            inputMode="numeric"
            max={3650}
            min={1}
            onChange={(event): void => {
              onChange({
                ...value,
                retentionDays: event.currentTarget.valueAsNumber
              })
            }}
            step={1}
            type="number"
            value={value.retentionDays ?? ''}
          />
          <span className="aw-checkbox-label">
            <input
              checked={value.retentionDays === null}
              disabled={disabled}
              onChange={(event): void => {
                onChange({
                  ...value,
                  retentionDays: event.currentTarget.checked ? null : 365
                })
              }}
              type="checkbox"
            />
            {t('visibility.noFixedRetention', { defaultValue: '不设置固定期限' })}
          </span>
        </label>
      </div>

      <fieldset className="aw-policy-fieldset">
        <legend>{t('visibility.modelRegions', { defaultValue: '允许模型处理的数据区域' })}</legend>
        <div className="aw-checkbox-grid">
          {KNOWLEDGE_MODEL_REGIONS.map((region) => (
            <label className="aw-checkbox-label" key={region}>
              <input
                checked={value.allowedModelRegions.includes(region)}
                disabled={disabled}
                onChange={(event): void => {
                  /** @brief 保持固定 UI 顺序的模型区域集合 / Model-region set in stable UI order. */
                  const allowedModelRegions = event.currentTarget.checked
                    ? KNOWLEDGE_MODEL_REGIONS.filter(
                        (candidate) =>
                          candidate === region || value.allowedModelRegions.includes(candidate)
                      )
                    : value.allowedModelRegions.filter((candidate) => candidate !== region)
                  onChange({ ...value, allowedModelRegions })
                }}
                type="checkbox"
              />
              {t(`visibility.regions.${region}`, { defaultValue: region })}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="aw-policy-fieldset">
        <legend>
          {t('visibility.processingControls', { defaultValue: '会话与模型处理控制' })}
        </legend>
        <div className="aw-checkbox-grid">
          <label className="aw-checkbox-label">
            <input
              checked={value.sessionOverrideAllowed}
              disabled={disabled}
              onChange={(event): void => {
                onChange({ ...value, sessionOverrideAllowed: event.currentTarget.checked })
              }}
              type="checkbox"
            />
            {t('visibility.sessionOverride', { defaultValue: '允许会话级覆盖' })}
          </label>
          <label className="aw-checkbox-label">
            <input
              checked={value.allowExternalModelProcessing}
              disabled={disabled}
              onChange={(event): void => {
                onChange({
                  ...value,
                  allowExternalModelProcessing: event.currentTarget.checked
                })
              }}
              type="checkbox"
            />
            {t('visibility.externalModel', { defaultValue: '允许外部模型处理' })}
          </label>
        </div>
      </fieldset>

      <fieldset className="aw-policy-fieldset">
        <legend>{t('visibility.agentRules', { defaultValue: 'Agent scope 字面规则' })}</legend>
        <p className="aw-setting-help">
          {t('visibility.literalPolicyHelp', {
            defaultValue:
              '规则按当前顺序保存；相同 scope 可以重复。这里展示策略事实，不推断任何 Agent 的最终访问结果。'
          })}
        </p>
        <div className="aw-policy-rule-list">
          {value.agentGrants.map((grant, grantIndex) => (
            <article className="aw-policy-rule" key={`${grantIndex}-${grant.agentScope}`}>
              <div className="aw-editor-grid">
                <label className="aw-editor-field">
                  <span>
                    {t('visibility.agentScopeCode', { defaultValue: 'Agent scope code' })}
                  </span>
                  <input
                    autoComplete="off"
                    disabled={disabled}
                    maxLength={101}
                    onChange={(event): void => {
                      onChange(
                        replaceGrant(value, grantIndex, {
                          ...grant,
                          agentScope: event.currentTarget.value
                        })
                      )
                    }}
                    pattern="[a-z][a-z0-9_.-]{2,100}"
                    placeholder="resume_assistant"
                    value={grant.agentScope}
                  />
                </label>
                <label className="aw-editor-field">
                  <span>{t('visibility.ruleEffect', { defaultValue: '规则效果' })}</span>
                  <select
                    disabled={disabled}
                    onChange={(event): void => {
                      onChange(
                        replaceGrant(value, grantIndex, {
                          ...grant,
                          effect: event.currentTarget.value as UiVisibilityEffect
                        })
                      )
                    }}
                    value={grant.effect}
                  >
                    <option value="deny">
                      {t('visibility.effects.deny', { defaultValue: '拒绝' })}
                    </option>
                    <option value="allow">
                      {t('visibility.effects.allow', { defaultValue: '允许' })}
                    </option>
                  </select>
                </label>
              </div>
              <fieldset className="aw-policy-operations">
                <legend>
                  {grant.effect === 'deny'
                    ? t('visibility.applicableOperations', { defaultValue: '适用操作' })
                    : t('visibility.allowedOperations', { defaultValue: '允许操作' })}
                </legend>
                <div className="aw-checkbox-grid">
                  {KNOWLEDGE_OPERATIONS.map((operation) => (
                    <label className="aw-checkbox-label" key={operation}>
                      <input
                        checked={grant.allowedOperations.includes(operation)}
                        disabled={disabled}
                        onChange={(event): void => {
                          /** @brief 按 canonical UI 顺序保存的操作集合 / Operation set stored in canonical UI order. */
                          const allowedOperations = event.currentTarget.checked
                            ? KNOWLEDGE_OPERATIONS.filter(
                                (candidate) =>
                                  candidate === operation ||
                                  grant.allowedOperations.includes(candidate)
                              )
                            : grant.allowedOperations.filter((candidate) => candidate !== operation)
                          onChange(
                            replaceGrant(value, grantIndex, {
                              ...grant,
                              allowedOperations
                            })
                          )
                        }}
                        type="checkbox"
                      />
                      {t(`visibility.operations.${operation}`, {
                        defaultValue: operationLabel(operation)
                      })}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className="aw-danger-button aw-policy-remove"
                disabled={disabled}
                onClick={(): void => {
                  onChange({
                    ...value,
                    agentGrants: value.agentGrants.filter(
                      (_candidate, candidateIndex) => candidateIndex !== grantIndex
                    )
                  })
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} />
                {t('visibility.removeRule', { defaultValue: '移除此规则' })}
              </button>
            </article>
          ))}
        </div>
        <button
          className="aw-quiet-button"
          disabled={disabled || value.agentGrants.length >= 100}
          onClick={(): void => {
            onChange({
              ...value,
              agentGrants: [
                ...value.agentGrants,
                {
                  agentScope: '',
                  allowedOperations: ['retrieve'],
                  effect: 'deny'
                }
              ]
            })
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
          {t('visibility.addRule', { defaultValue: '添加规则' })}
        </button>
      </fieldset>
    </div>
  )
}
