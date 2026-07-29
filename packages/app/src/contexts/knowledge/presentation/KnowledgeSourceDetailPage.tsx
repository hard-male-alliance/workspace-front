/** @file API v2 KnowledgeSource 权威详情页 / API v2 authoritative KnowledgeSource detail page. */

import {
  ArrowLeft,
  Eye,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Play,
  ShieldCheck
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { useAsyncResource, useKnowledgeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { createUiCommandId } from '../../../shared-kernel/command'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type {
  UiKnowledgeOriginalContent,
  UiKnowledgeModelRegion,
  UiKnowledgeOperation,
  UiKnowledgeProblem,
  UiKnowledgeSource,
  UiKnowledgeSourceAuthority,
  UiVisibilityEffect
} from '../domain/models'
import {
  getKnowledgeIngestionLabel,
  getKnowledgeIngestionTone,
  getKnowledgeSensitivityLabel,
  getKnowledgeSourceTypeLabel
} from './knowledge-source-presentation'

/** @brief 详情页原始文本预览上限 / Original-text preview limit on the detail page. */
const ORIGINAL_CONTENT_PREVIEW_BYTES = 1024 * 1024
/** @brief 后端异步处理期间的权威状态刷新间隔 / Authority refresh interval during asynchronous backend processing. */
const INGESTION_REFRESH_MILLISECONDS = 5_000
/** @brief 必须持续重读服务端权威的摄取状态 / Ingestion states requiring continued authority rereads. */
const ACTIVE_INGESTION_STATUSES: ReadonlySet<UiKnowledgeSource['ingestion']['status']> = new Set([
  'queued',
  'fetching',
  'parsing',
  'chunking',
  'embedding'
])

/** @brief 原始内容的按需读取状态 / Lazy original-content read state. */
type OriginalContentState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'error'; readonly error: unknown }
  | {
      readonly status: 'ready'
      /** @brief 服务端原始内容元数据 / Server original-content metadata. */
      readonly content: UiKnowledgeOriginalContent
      /** @brief 严格 UTF-8 解码后的文本；二进制为 null / Strictly UTF-8 decoded text, or null for binary content. */
      readonly text: string | null
    }

/**
 * @brief 判断原始媒体类型是否适合只读文本展示 / Determine whether an original media type is suitable for read-only text display.
 * @param mediaType 带可选参数的媒体类型 / Media type with optional parameters.
 * @return 可按 UTF-8 文本展示时为 true / True when the content may be displayed as UTF-8 text.
 */
function isTextualOriginalContent(mediaType: string): boolean {
  /** @brief 去除参数并统一大小写的媒体类型 / Lowercase media type without parameters. */
  const essence = mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return (
    essence.startsWith('text/') ||
    essence === 'application/json' ||
    essence === 'application/xml' ||
    essence.endsWith('+json') ||
    essence.endsWith('+xml')
  )
}

/**
 * @brief 对原始内容执行严格 UTF-8 解码 / Strictly decode original content as UTF-8.
 * @param content 未经转换的原始内容 / Original content before conversion.
 * @return 文本媒体类型的原文，二进制为 null / Original text for textual media, or null for binary media.
 */
function decodeOriginalContent(content: UiKnowledgeOriginalContent): string | null {
  if (!isTextualOriginalContent(content.mediaType)) return null
  return new TextDecoder('utf-8', { fatal: true }).decode(content.bytes)
}

/** @brief KnowledgeSource 详情读取结果 / KnowledgeSource detail-read result. */
type KnowledgeSourceDetailAuthority =
  | {
      /** @brief 路由缺少 Source identity / Route missing a Source identity. */
      readonly kind: 'missing-source'
    }
  | {
      /** @brief 当前会话没有 Workspace / Current session has no Workspace. */
      readonly kind: 'no-workspace'
    }
  | {
      /** @brief 已取得 Source 与强 ETag 权威 / Source authority and strong ETag were read. */
      readonly kind: 'source'
      /** @brief 与同一 HTTP 响应配对的权威 / Authority paired in the same HTTP response. */
      readonly authority: UiKnowledgeSourceAuthority
      /** @brief 当前 Workspace 展示名 / Current Workspace display name. */
      readonly workspaceName: string
    }

/**
 * @brief 详情响应不属于请求 path 时的低敏感错误 / Low-sensitivity error for a detail response outside the requested path.
 * @note 错误不携带任何服务端 identity 或响应正文 / The error carries no server identity or response body.
 */
class KnowledgeSourceDetailIntegrityError extends Error {
  override readonly name = 'KnowledgeSourceDetailIntegrityError'

  /** @brief 构造固定详情完整性错误 / Construct a stable detail-integrity error. */
  constructor() {
    super('KnowledgeSource detail failed a path-identity integrity check.')
  }
}

/**
 * @brief 校验单项权威与 Workspace、Source path identity 一致 / Verify that one authority matches its Workspace and Source path identities.
 * @param authority 服务端单项权威 / Authoritative server representation.
 * @param workspaceId 请求中的 Workspace identity / Workspace identity from the request.
 * @param sourceId 请求中的 Source identity / Source identity from the request.
 */
function assertDetailPathIntegrity(
  authority: UiKnowledgeSourceAuthority,
  workspaceId: UiKnowledgeSource['workspaceId'],
  sourceId: UiKnowledgeSource['id']
): void {
  if (authority.source.workspaceId !== workspaceId || authority.source.id !== sourceId) {
    throw new KnowledgeSourceDetailIntegrityError()
  }
}

/**
 * @brief 格式化服务端 UTC 时刻 / Format a server UTC timestamp.
 * @param timestamp 经契约验证的 UTC 时刻 / Contract-validated UTC timestamp.
 * @param locale 应用语言 / Application locale.
 * @return 本地化日期时间 / Localized date and time.
 */
function formatTimestamp(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

/**
 * @brief 获取策略效果本地化标签 / Get a localized policy-effect label.
 * @param effect 策略效果 / Policy effect.
 * @param translate 翻译函数 / Translation function.
 * @return 用户可读策略效果 / User-readable policy effect.
 */
function getEffectLabel(effect: UiVisibilityEffect, translate: TFunction): string {
  return effect === 'allow'
    ? translate('visibility.effects.allow', { defaultValue: '允许' })
    : translate('visibility.effects.deny', { defaultValue: '拒绝' })
}

/**
 * @brief 获取策略操作本地化标签 / Get a localized policy-operation label.
 * @param operation Knowledge 操作 / Knowledge operation.
 * @param translate 翻译函数 / Translation function.
 * @return 用户可读操作 / User-readable operation.
 */
function getOperationLabel(operation: UiKnowledgeOperation, translate: TFunction): string {
  /** @brief 操作默认标签 / Default operation labels. */
  const labels: Readonly<
    Record<UiKnowledgeOperation, { readonly key: string; readonly label: string }>
  > = {
    derive: { key: 'visibility.derive', label: '作为推理依据' },
    quote: { key: 'visibility.quote', label: '引用原文' },
    retrieve: { key: 'visibility.retrieve', label: '检索' },
    summarize: { key: 'visibility.summarize', label: '摘要' },
    write_back: { key: 'visibility.writeBack', label: '写回来源' }
  }
  /** @brief 当前操作标签 / Current operation label. */
  const definition = labels[operation]
  return translate(definition.key, { defaultValue: definition.label })
}

/**
 * @brief 解释来源为何尚不能用于模拟面试 / Explain why a source is not yet usable by Interview.
 * @param source 当前权威知识来源 / Current authoritative Knowledge source.
 * @return 空数组表示可用，否则为互不重复的阻塞原因 / Empty when eligible; otherwise mutually distinct blockers.
 */
function interviewEligibilityIssues(source: UiKnowledgeSource): readonly string[] {
  /** @brief 当前策略中的模拟面试检索授权 / Interview retrieval grant in the current policy. */
  const grant = source.visibility.agentGrants.find(
    (candidate) => candidate.agentScope === 'interview_coach'
  )
  /** @brief 按实际会话筛选条件生成的阻塞原因 / Blockers derived from actual session-selection filters. */
  const issues: string[] = []
  if (!source.enabled) issues.push('来源已停用')
  if (source.ingestion.status !== 'ready' || source.currentVersionId === null) {
    issues.push('内容处理尚未完成')
  }
  if (!source.visibility.allowExternalModelProcessing) issues.push('未允许外部模型处理')
  if (!source.visibility.allowedModelRegions.includes('global')) {
    issues.push('未允许当前模型区域')
  }
  if (
    grant === undefined ||
    grant.effect !== 'allow' ||
    !grant.allowedOperations.includes('retrieve')
  ) {
    issues.push('未授权模拟面试检索')
  }
  return issues
}

/**
 * @brief 获取模型区域本地化标签 / Get a localized model-region label.
 * @param region 模型区域 / Model region.
 * @param translate 翻译函数 / Translation function.
 * @return 用户可读区域 / User-readable region.
 */
function getRegionLabel(region: UiKnowledgeModelRegion, translate: TFunction): string {
  /** @brief 区域默认标签 / Default region labels. */
  const labels = {
    cn: { key: 'visibility.regions.cn', label: '中国大陆' },
    global: { key: 'visibility.regions.global', label: '全球' },
    private_deployment: {
      key: 'visibility.regions.privateDeployment',
      label: '私有部署'
    }
  } as const
  /** @brief 当前区域标签 / Current region label. */
  const definition = labels[region]
  return translate(definition.key, { defaultValue: definition.label })
}

/**
 * @brief 呈现不含 secret 的公开来源配置 / Render secret-free public source config.
 * @param props 来源配置 / Source config.
 * @return 只包含 canonical public_config 字段的事实列表 / Fact list containing only canonical public_config fields.
 */
function PublicConfigFacts({
  source
}: {
  /** @brief 来源权威 / Source authority. */
  readonly source: UiKnowledgeSource
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 不含 secret 的公开配置 / Secret-free public config. */
  const config = source.publicConfig
  /** @brief 是否存在任何可展示公开字段 / Whether any displayable public field exists. */
  const hasFacts =
    config.filename !== undefined ||
    config.mediaType !== undefined ||
    config.url !== undefined ||
    config.cloneUrl !== undefined ||
    Object.hasOwn(config, 'ref') ||
    config.resumeId !== undefined

  if (!hasFacts) {
    return (
      <p className="aw-card-description">
        {t('knowledge.noPublicConfig', {
          defaultValue: '该来源没有可展示的公开配置。'
        })}
      </p>
    )
  }

  return (
    <dl>
      {config.filename === undefined ? null : (
        <div className="aw-list-row">
          <dt className="aw-muted">{t('knowledge.filename', { defaultValue: '文件名' })}</dt>
          <dd>{config.filename}</dd>
        </div>
      )}
      {config.mediaType === undefined ? null : (
        <div className="aw-list-row">
          <dt className="aw-muted">{t('knowledge.mediaType', { defaultValue: '媒体类型' })}</dt>
          <dd>{config.mediaType}</dd>
        </div>
      )}
      {config.url === undefined ? null : (
        <div className="aw-list-row">
          <dt className="aw-muted">{t('knowledge.sourceUrl', { defaultValue: '来源地址' })}</dt>
          <dd>{config.url}</dd>
        </div>
      )}
      {config.cloneUrl === undefined ? null : (
        <div className="aw-list-row">
          <dt className="aw-muted">{t('knowledge.cloneUrl', { defaultValue: 'Clone 地址' })}</dt>
          <dd>{config.cloneUrl}</dd>
        </div>
      )}
      {Object.hasOwn(config, 'ref') ? (
        <div className="aw-list-row">
          <dt className="aw-muted">{t('knowledge.gitRef', { defaultValue: 'Git ref' })}</dt>
          <dd>
            {config.ref ??
              t('knowledge.unpinnedRef', {
                defaultValue: '未固定'
              })}
          </dd>
        </div>
      ) : null}
      {config.resumeId === undefined ? null : (
        <div className="aw-list-row">
          <dt className="aw-muted">
            {t('knowledge.resumeReference', { defaultValue: '关联简历' })}
          </dt>
          <dd>{config.resumeId}</dd>
        </div>
      )}
    </dl>
  )
}

/**
 * @brief 将 last_problem 收敛为本地安全说明 / Narrow last_problem to local safe copy.
 * @param problem 经契约验证的问题 / Contract-validated problem.
 * @param translate 翻译函数 / Translation function.
 * @return 不使用服务端人类文本的本地说明 / Local copy using no server human-readable text.
 */
function getLocalProblemDescription(problem: UiKnowledgeProblem, translate: TFunction): string {
  /** @brief 已知低基数 code 的本地说明 / Local descriptions for known low-cardinality codes. */
  const knownDescriptions: Readonly<Record<string, string>> = {
    'knowledge.ingestion_failed': translate('knowledge.problem.ingestionFailed', {
      defaultValue: '最近一次处理没有完成。'
    }),
    'knowledge.source_unavailable': translate('knowledge.problem.sourceUnavailable', {
      defaultValue: '处理时无法读取来源。'
    })
  }
  return (
    knownDescriptions[problem.code] ??
    (problem.retryable
      ? translate('knowledge.problem.retryable', {
          defaultValue: '服务记录了一个可重试的处理问题。'
        })
      : translate('knowledge.problem.notRetryable', {
          defaultValue: '服务记录了一个当前不可重试的处理问题。'
        }))
  )
}

/**
 * @brief 安全呈现最近一次摄取 Problem / Safely render the most recent ingestion Problem.
 * @param props 结构化 Problem / Structured Problem.
 * @return 仅含本地文案、code、status、retryable 与 request ID 的提示 / Notice containing only local copy, code, status, retryable, and request ID.
 */
function KnowledgeProblemNotice({
  problem
}: {
  /** @brief 最近结构化问题 / Most recent structured problem. */
  readonly problem: UiKnowledgeProblem
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()

  return (
    <section aria-labelledby="knowledge-last-problem-title" className="aw-card aw-card-pad">
      <h2 className="aw-card-title" id="knowledge-last-problem-title">
        {t('knowledge.lastProblem', { defaultValue: '最近记录的问题' })}
      </h2>
      <p className="aw-card-description">{getLocalProblemDescription(problem, t)}</p>
      <dl>
        <div className="aw-list-row">
          <dt className="aw-muted">{t('knowledge.problemCode', { defaultValue: '问题代码' })}</dt>
          <dd>{problem.code}</dd>
        </div>
        <div className="aw-list-row">
          <dt className="aw-muted">
            {t('knowledge.problemStatus', { defaultValue: 'HTTP 状态' })}
          </dt>
          <dd>{problem.status}</dd>
        </div>
        <div className="aw-list-row">
          <dt className="aw-muted">
            {t('knowledge.problemRetryable', { defaultValue: '可重试' })}
          </dt>
          <dd>
            {problem.retryable
              ? t('common.yes', { defaultValue: '是' })
              : t('common.no', { defaultValue: '否' })}
          </dd>
        </div>
        <div className="aw-list-row">
          <dt className="aw-muted">{t('errors.referenceLabel', { defaultValue: '关联编号' })}</dt>
          <dd>{problem.requestId}</dd>
        </div>
      </dl>
    </section>
  )
}

/**
 * @brief 呈现来源的字面可见性策略 / Render a source's literal visibility policy.
 * @param props 来源权威 / Source authority.
 * @return 不计算 effective access 的策略事实 / Policy facts without computing effective access.
 */
function LiteralVisibilityPolicy({
  source
}: {
  /** @brief 来源权威 / Source authority. */
  readonly source: UiKnowledgeSource
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 服务端字面策略 / Literal server policy. */
  const policy = source.visibility

  return (
    <section aria-labelledby="knowledge-policy-title" className="aw-card aw-card-pad">
      <div className="aw-inline-actions">
        <ShieldCheck aria-hidden="true" className="aw-accent-icon" size={18} />
        <div>
          <h2 className="aw-card-title" id="knowledge-policy-title">
            {t('knowledge.savedPolicy', { defaultValue: '已保存的访问策略' })}
          </h2>
          <p className="aw-card-description">
            {t('knowledge.literalPolicyNotice', {
              defaultValue: '这里只展示服务端保存的规则；最终访问由服务端在每次执行时判定。'
            })}
          </p>
        </div>
      </div>

      <div className="aw-list-row">
        <span className="aw-muted">
          {t('visibility.defaultEffect', { defaultValue: '未匹配规则时' })}
        </span>
        <span className="aw-status">{getEffectLabel(policy.defaultEffect, t)}</span>
      </div>
      <div className="aw-list-row">
        <span className="aw-muted">{t('knowledge.sensitivity', { defaultValue: '敏感度' })}</span>
        <span>{getKnowledgeSensitivityLabel(policy.sensitivity, t)}</span>
      </div>
      <div className="aw-list-row">
        <span className="aw-muted">
          {t('visibility.allowedRegions', { defaultValue: '允许的模型区域' })}
        </span>
        <span className="aw-chip-row">
          {policy.allowedModelRegions.map((region) => (
            <span className="aw-chip" key={region}>
              {getRegionLabel(region, t)}
            </span>
          ))}
        </span>
      </div>
      <div className="aw-list-row">
        <span className="aw-muted">
          {t('visibility.sessionOverride', { defaultValue: '允许会话级选择' })}
        </span>
        <span>
          {policy.sessionOverrideAllowed
            ? t('common.yes', { defaultValue: '是' })
            : t('common.no', { defaultValue: '否' })}
        </span>
      </div>
      <div className="aw-list-row">
        <span className="aw-muted">
          {t('visibility.externalModel', { defaultValue: '允许外部模型处理' })}
        </span>
        <span>
          {policy.allowExternalModelProcessing
            ? t('common.yes', { defaultValue: '是' })
            : t('common.no', { defaultValue: '否' })}
        </span>
      </div>
      <div className="aw-list-row">
        <span className="aw-muted">{t('knowledge.retention', { defaultValue: '保留期限' })}</span>
        <span>
          {policy.retentionDays === null
            ? t('knowledge.noFixedRetention', { defaultValue: '未设置固定期限' })
            : t('knowledge.retentionDays', {
                count: policy.retentionDays,
                defaultValue: '{{count}} 天'
              })}
        </span>
      </div>
      <div className="aw-list-row">
        <span className="aw-muted">
          {t('knowledge.policyVersionLabel', {
            defaultValue: '策略版本'
          })}
        </span>
        <span>{policy.policyVersion}</span>
      </div>

      <h3 className="aw-list-row-title">
        {t('knowledge.agentGrantRules', { defaultValue: 'Agent scope 规则' })}
      </h3>
      {policy.agentGrants.length === 0 ? (
        <p className="aw-card-description">
          {t('knowledge.noAgentGrants', { defaultValue: '没有显式 Agent scope 规则。' })}
        </p>
      ) : (
        <div className="aw-policy-matrix">
          <table className="aw-policy-table">
            <thead>
              <tr>
                <th scope="col">{t('visibility.agentScope', { defaultValue: 'Agent scope' })}</th>
                <th scope="col">{t('visibility.defaultEffect', { defaultValue: '效果' })}</th>
                <th scope="col">
                  {t('knowledge.applicableOperations', { defaultValue: '适用操作' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {policy.agentGrants.map((grant, index) => (
                <tr key={`${grant.agentScope}:${index}`}>
                  <td>{grant.agentScope}</td>
                  <td>{getEffectLabel(grant.effect, t)}</td>
                  <td>
                    <span className="aw-chip-row">
                      {grant.allowedOperations.map((operation) => (
                        <span className="aw-chip" key={operation}>
                          {getOperationLabel(operation, t)}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * @brief 呈现已加载的 KnowledgeSource 权威详情 / Render a loaded authoritative KnowledgeSource detail.
 * @param props 来源权威与 Workspace 名称 / Source authority and Workspace name.
 * @return 字面展示 Source、ingestion、public_config 与 visibility / Literal display of Source, ingestion, public_config, and visibility.
 */
function KnowledgeSourceDetail({
  authority,
  onRefresh,
  workspaceName
}: {
  /** @brief 与强 ETag 原子配对的来源权威 / Source authority atomically paired with a strong ETag. */
  readonly authority: UiKnowledgeSourceAuthority
  /** @brief 处理完成后重新读取权威来源 / Reload the authoritative source after processing completes. */
  readonly onRefresh: () => void
  /** @brief 当前 Workspace 展示名 / Current Workspace display name. */
  readonly workspaceName: string
}): React.JSX.Element {
  /** @brief 翻译与应用语言 / Translation and application locale. */
  const { i18n, t } = useTranslation()
  /** @brief Knowledge 应用端口 / Knowledge application port. */
  const knowledge = useKnowledgeGateway()
  /** @brief 手工笔记处理命令状态 / Manual-note ingestion command state. */
  const [processing, setProcessing] = useState<
    | { readonly status: 'idle' | 'queued' | 'processing' }
    | { readonly status: 'error'; readonly error: unknown }
  >({ status: 'idle' })
  /** @brief 仅由用户明确操作触发的原始内容状态 / Original-content state triggered only by an explicit user action. */
  const [originalContent, setOriginalContent] = useState<OriginalContentState>({ status: 'idle' })
  /** @brief 服务端权威来源 / Authoritative source. */
  const source = authority.source
  /** @brief 删除中或已删除来源必须保持只读 / Sources being deleted or already deleted must remain read-only. */
  const isReadOnly = source.ingestion.status === 'deleting' || source.ingestion.status === 'deleted'
  /** @brief 当前手工笔记是否需要启动或恢复处理 / Whether this manual note needs ingestion started or resumed. */
  const canStartProcessing =
    source.sourceType === 'manual_note' &&
    (source.ingestion.status === 'not_started' ||
      source.ingestion.status === 'failed' ||
      source.ingestion.status === 'stale')
  /** @brief 来源策略是否允许外部向量模型处理 / Whether source policy permits external embedding-model processing. */
  const processingAllowed = source.visibility.allowExternalModelProcessing
  /** @brief 当前是否已有处理命令在途 / Whether an ingestion command is in flight. */
  const isProcessing = processing.status === 'queued' || processing.status === 'processing'
  /** @brief 模拟面试实际来源筛选条件的阻塞说明 / Blockers from the actual Interview source-selection conditions. */
  const interviewIssues = interviewEligibilityIssues(source)

  useEffect((): (() => void) | undefined => {
    if (!ACTIVE_INGESTION_STATUSES.has(source.ingestion.status)) return undefined
    /** @brief 周期权威状态重读计时器；single-flight 刷新会拒绝重叠请求 / Periodic authority reread timer; the single-flight refresh rejects overlap. */
    const interval = window.setInterval(onRefresh, INGESTION_REFRESH_MILLISECONDS)
    return (): void => window.clearInterval(interval)
  }, [onRefresh, source.ingestion.status])

  /**
   * @brief 启动已有手工笔记的统一后端摄取任务 / Start the shared backend ingestion job for an existing manual note.
   * @return 后端接受任务后完成的 Promise / Promise settled after backend job acceptance.
   */
  async function startProcessing(): Promise<void> {
    setProcessing({ status: 'queued' })
    try {
      await knowledge.ingestKnowledgeSource({
        commandId: createUiCommandId(),
        force: source.ingestion.status === 'failed' || source.ingestion.status === 'stale',
        onProgress: (phase): void => {
          if (phase !== 'completed') setProcessing({ status: phase })
        },
        sourceId: source.id,
        workspaceId: source.workspaceId
      })
      onRefresh()
    } catch (error: unknown) {
      setProcessing({ error, status: 'error' })
    }
  }

  /**
   * @brief 按需读取未经切块与向量化的原始内容 / Lazily read original content before chunking and vectorization.
   * @return 请求与严格文本解码完成 Promise / Promise settled after the request and strict text decoding.
   */
  async function loadOriginalContent(): Promise<void> {
    setOriginalContent({ status: 'loading' })
    try {
      /** @brief 受鉴权与字节上限保护的原始内容 / Original content protected by authorization and a byte ceiling. */
      const content = await knowledge.getKnowledgeSourceOriginalContent({
        maximumBytes: ORIGINAL_CONTENT_PREVIEW_BYTES,
        signal: new AbortController().signal,
        sourceId: source.id,
        workspaceId: source.workspaceId
      })
      setOriginalContent({ content, status: 'ready', text: decodeOriginalContent(content) })
    } catch (error: unknown) {
      setOriginalContent({ error, status: 'error' })
    }
  }

  return (
    <div className="aw-page">
      <header className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{workspaceName}</p>
          <h1 className="aw-page-title">{source.name}</h1>
          <p className="aw-page-description">
            {t('knowledge.authoritativeDetailDescription', {
              defaultValue: '以下内容来自当前 Workspace 的单项权威读取。'
            })}
          </p>
        </div>
        <div className="aw-inline-actions">
          <Link className="aw-quiet-button" to="/knowledge">
            <ArrowLeft aria-hidden="true" size={15} />
            {t('common.back', { defaultValue: '返回知识来源' })}
          </Link>
          {isReadOnly ? (
            <span className="aw-status aw-status--active">
              <LockKeyhole aria-hidden="true" size={13} />
              {t('knowledge.readOnlyLifecycle', { defaultValue: '删除生命周期中，只读' })}
            </span>
          ) : (
            <Link className="aw-primary-button" to={`/knowledge/${source.id}/edit`}>
              <Pencil aria-hidden="true" size={14} />
              {t('knowledge.editSource', { defaultValue: '编辑名称与策略' })}
            </Link>
          )}
        </div>
      </header>

      <section aria-labelledby="knowledge-ingestion-title" className="aw-visibility-summary">
        <div>
          <p className="aw-sidebar-label">
            {t('knowledge.processingState', { defaultValue: '处理状态' })}
          </p>
          <h2 id="knowledge-ingestion-title">
            {getKnowledgeIngestionLabel(source.ingestion.status, t)}
          </h2>
        </div>
        <div className="aw-visibility-summary-stats">
          <span>
            <strong>{source.ingestion.documentCount}</strong>
            {t('knowledge.documents', { defaultValue: '份文档' })}
          </span>
          <span>
            <strong>{source.ingestion.chunkCount}</strong>
            {t('knowledge.chunks', { defaultValue: '个片段' })}
          </span>
          <span
            aria-atomic="true"
            className={`aw-status ${getKnowledgeIngestionTone(source.ingestion.status)}`}
            role="status"
          >
            {getKnowledgeIngestionLabel(source.ingestion.status, t)}
          </span>
          {canStartProcessing ? (
            <button
              className="aw-primary-button"
              disabled={isProcessing || !processingAllowed}
              onClick={(): void => {
                void startProcessing()
              }}
              type="button"
            >
              {isProcessing ? (
                <LoaderCircle aria-hidden="true" className="aw-spin" size={14} />
              ) : (
                <Play aria-hidden="true" size={14} />
              )}
              {isProcessing
                ? t('knowledge.processingManualNote', { defaultValue: '正在处理…' })
                : t('knowledge.processManualNote', { defaultValue: '开始处理' })}
            </button>
          ) : null}
        </div>
      </section>

      {canStartProcessing && !processingAllowed ? (
        <p className="aw-inline-notice">
          {t('knowledge.externalProcessingRequired', {
            defaultValue:
              '当前向量模型通过外部服务运行。请先在来源设置中允许外部模型处理，再开始处理。'
          })}
        </p>
      ) : null}

      {processing.status === 'error' ? (
        <p className="aw-inline-error" role="alert">
          <ResourceFailureMessage error={processing.error} />
        </p>
      ) : null}

      <p
        className={interviewIssues.length === 0 ? 'aw-inline-notice' : 'aw-inline-warning'}
        role="status"
      >
        <strong>模拟面试：</strong>{' '}
        {interviewIssues.length === 0
          ? '此来源已满足选择和检索条件。'
          : `暂不可用（${interviewIssues.join('、')}）。`}
      </p>

      <div className="aw-visibility-grid">
        <section aria-labelledby="knowledge-source-facts-title" className="aw-card aw-card-pad">
          <div className="aw-inline-actions">
            <FileText aria-hidden="true" className="aw-accent-icon" size={18} />
            <div>
              <h2 className="aw-card-title" id="knowledge-source-facts-title">
                {t('knowledge.sourceFacts', { defaultValue: '来源事实' })}
              </h2>
              <p className="aw-card-description">
                {getKnowledgeSourceTypeLabel(source.sourceType, t)}
              </p>
            </div>
          </div>
          <dl>
            <div className="aw-list-row">
              <dt className="aw-muted">{t('knowledge.revision', { defaultValue: '领域版本' })}</dt>
              <dd>{source.revision}</dd>
            </div>
            <div className="aw-list-row">
              <dt className="aw-muted">{t('knowledge.enabled', { defaultValue: '参与检索' })}</dt>
              <dd>
                {source.enabled
                  ? t('common.yes', { defaultValue: '是' })
                  : t('common.no', { defaultValue: '否' })}
              </dd>
            </div>
            <div className="aw-list-row">
              <dt className="aw-muted">{t('knowledge.createdAt', { defaultValue: '创建时间' })}</dt>
              <dd>
                <time dateTime={source.createdAt}>
                  {formatTimestamp(source.createdAt, i18n.language)}
                </time>
              </dd>
            </div>
            <div className="aw-list-row">
              <dt className="aw-muted">{t('knowledge.updatedAt', { defaultValue: '更新时间' })}</dt>
              <dd>
                <time dateTime={source.updatedAt}>
                  {formatTimestamp(source.updatedAt, i18n.language)}
                </time>
              </dd>
            </div>
            <div className="aw-list-row">
              <dt className="aw-muted">
                {t('knowledge.lastSuccessAt', { defaultValue: '最近处理成功' })}
              </dt>
              <dd>
                {source.ingestion.lastSuccessAt === null ? (
                  t('knowledge.neverSucceeded', { defaultValue: '尚无成功记录' })
                ) : (
                  <time dateTime={source.ingestion.lastSuccessAt}>
                    {formatTimestamp(source.ingestion.lastSuccessAt, i18n.language)}
                  </time>
                )}
              </dd>
            </div>
            <div className="aw-list-row">
              <dt className="aw-muted">
                {t('knowledge.currentVersion', { defaultValue: '当前完成版本' })}
              </dt>
              <dd>
                {source.currentVersionId ??
                  t('knowledge.noCurrentVersion', { defaultValue: '尚无当前版本' })}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="knowledge-public-config-title" className="aw-card aw-card-pad">
          <h2 className="aw-card-title" id="knowledge-public-config-title">
            {t('knowledge.publicConfig', { defaultValue: '公开来源配置' })}
          </h2>
          <p className="aw-card-description">
            {t('knowledge.publicConfigDescription', {
              defaultValue: '这里只展示 API v2 明确允许公开的来源字段。'
            })}
          </p>
          <PublicConfigFacts source={source} />
        </section>
      </div>

      <section aria-labelledby="knowledge-original-content-title" className="aw-card aw-card-pad">
        <div className="aw-inline-actions">
          <div>
            <h2 className="aw-card-title" id="knowledge-original-content-title">
              {t('knowledge.originalContent', { defaultValue: '原始内容' })}
            </h2>
            <p className="aw-card-description">
              {t('knowledge.originalContentDescription', {
                defaultValue: '查看上传或创建时的原文，不展示切词和向量化后的片段。'
              })}
            </p>
          </div>
          <button
            className="aw-quiet-button"
            disabled={originalContent.status === 'loading'}
            onClick={(): void => {
              void loadOriginalContent()
            }}
            type="button"
          >
            {originalContent.status === 'loading' ? (
              <LoaderCircle aria-hidden="true" className="aw-spin" size={14} />
            ) : (
              <Eye aria-hidden="true" size={14} />
            )}
            {originalContent.status === 'loading'
              ? t('knowledge.loadingOriginalContent', { defaultValue: '正在读取…' })
              : t('knowledge.viewOriginalContent', { defaultValue: '查看原始内容' })}
          </button>
        </div>

        {originalContent.status === 'error' ? (
          <p className="aw-inline-error" role="alert">
            <ResourceFailureMessage error={originalContent.error} />
          </p>
        ) : null}

        {originalContent.status === 'ready' && originalContent.text !== null ? (
          <>
            {!originalContent.content.complete ? (
              <p className="aw-inline-notice">
                {t('knowledge.originalContentTruncated', {
                  defaultValue: '内容较大，当前仅显示前 1 MiB。'
                })}
              </p>
            ) : null}
            <pre className="aw-knowledge-original-content">{originalContent.text}</pre>
          </>
        ) : null}

        {originalContent.status === 'ready' && originalContent.text === null ? (
          <p className="aw-inline-notice">
            {t('knowledge.originalBinaryContent', {
              defaultValue:
                '该来源是二进制原文件，不能作为纯文本直接展示；当前页面不会用处理后的切片冒充原文。'
            })}
          </p>
        ) : null}
      </section>

      <LiteralVisibilityPolicy source={source} />

      {source.ingestion.lastProblem === null ? null : (
        <KnowledgeProblemNotice problem={source.ingestion.lastProblem} />
      )}
    </div>
  )
}

/**
 * @brief API v2 KnowledgeSource 权威详情路由页 / API v2 authoritative KnowledgeSource detail route page.
 * @return 与当前 Workspace、principal、路由 Source identity 绑定的详情 / Detail bound to the current Workspace, principal, and route Source identity.
 */
export function KnowledgeSourceDetailPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由来源 identity / Route source identity. */
  const { sourceId } = useParams()
  /** @brief Knowledge 应用端口 / Knowledge application port. */
  const knowledge = useKnowledgeGateway()
  /** @brief Workspace 会话端口 / Workspace-session port. */
  const workspaceSession = useWorkspaceSession()
  /** @brief Workspace/principal 选择修订 / Workspace/principal selection revision. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 路由 Source ID 的不透明领域表示 / Opaque domain representation of the route Source ID. */
  const requestedSourceId = useMemo(
    () => (sourceId === undefined ? null : asUiOpaqueId<'knowledge-source'>(sourceId)),
    [sourceId]
  )

  /** @brief 读取单个 Source 与强 ETag 权威 / Read one Source and its strong ETag authority. */
  const loadSource = useCallback(
    async (signal: AbortSignal): Promise<KnowledgeSourceDetailAuthority> => {
      if (requestedSourceId === null) return { kind: 'missing-source' }
      /** @brief 读取时的当前 Workspace / Current Workspace at read time. */
      const workspace = await workspaceSession.getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      if (workspace === undefined) return { kind: 'no-workspace' }

      /** @brief 与强 ETag 同一响应的来源权威 / Source authority from the same response as its strong ETag. */
      const authority = await knowledge.getKnowledgeSource({
        signal,
        sourceId: requestedSourceId,
        workspaceId: workspace.id
      })
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      assertDetailPathIntegrity(authority, workspace.id, requestedSourceId)
      return { authority, kind: 'source', workspaceName: workspace.name }
    },
    [knowledge, requestedSourceId, selectionRevision, workspaceSession]
  )
  /** @brief 绑定 Workspace/principal/Source identity 的详情资源 / Detail resource bound to Workspace/principal/Source identity. */
  const detail = useAsyncResource(
    'knowledge.source',
    loadSource,
    `${selectionRevision}:${sourceId ?? 'missing'}`
  )
  /** @brief 当前详情请求的稳定资源 identity / Stable resource identity for the current detail request. */
  const resourceIdentity = `${selectionRevision}:${sourceId ?? 'missing'}`
  /** @brief 后台刷新得到且仍属于当前资源的最新权威 / Latest background authority still belonging to the current resource. */
  const [backgroundDetail, setBackgroundDetail] = useState<{
    /** @brief 防止 Workspace 或路由切换后复用旧响应 / Prevent reuse after a Workspace or route switch. */
    readonly resourceIdentity: string
    /** @brief 后台读取结果 / Background read result. */
    readonly data: KnowledgeSourceDetailAuthority
  } | null>(null)
  /** @brief 当前后台刷新控制器；非 null 同时充当 single-flight 锁 / Current refresh controller, also serving as a single-flight lock. */
  const backgroundController = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => () => {
      backgroundController.current?.abort()
      backgroundController.current = null
    },
    [resourceIdentity]
  )

  /**
   * @brief 保留当前详情并在后台重读权威 / Preserve the current detail while rereading authority in the background.
   * @return 无返回值；相同资源同一时刻最多一个请求 / No return value; at most one request per resource at a time.
   */
  const refreshSource = useCallback((): void => {
    if (backgroundController.current !== null) return
    /** @brief 仅属于本次后台读取的取消控制器 / Abort controller owned by this background read. */
    const controller = new AbortController()
    backgroundController.current = controller
    void loadSource(controller.signal)
      .then((data): void => {
        if (!controller.signal.aborted) {
          setBackgroundDetail({ data, resourceIdentity })
        }
      })
      .catch((error: unknown): void => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          // 保留最后一次成功权威；下一轮轮询继续尝试。/ Preserve stale authority and retry next poll.
        }
      })
      .finally((): void => {
        if (backgroundController.current === controller) {
          backgroundController.current = null
        }
      })
  }, [loadSource, resourceIdentity])

  if (detail.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('knowledge.loadingSourceDetail', {
            defaultValue: '正在加载知识来源详情…'
          })}
        />
      </div>
    )
  }

  if (detail.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={detail.error}
          onRetry={detail.retry}
          title={t('knowledge.sourceDetailError', {
            defaultValue: '无法加载知识来源详情'
          })}
        />
      </div>
    )
  }

  /** @brief 初始读取或后台刷新中较新的当前详情 / Current detail from the initial read or a newer background refresh. */
  const currentDetail =
    backgroundDetail?.resourceIdentity === resourceIdentity ? backgroundDetail.data : detail.data

  if (currentDetail.kind === 'missing-source') {
    return (
      <div className="aw-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/knowledge">
              {t('common.back', { defaultValue: '返回知识来源' })}
            </Link>
          }
          description={t('knowledge.missingSourceDescription', {
            defaultValue: '当前地址没有包含可读取的来源标识。'
          })}
          title={t('knowledge.missingSourceTitle', { defaultValue: '缺少来源标识' })}
        />
      </div>
    )
  }

  if (currentDetail.kind === 'no-workspace') {
    return (
      <div className="aw-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/">
              {t('common.backHome', { defaultValue: '返回工作台' })}
            </Link>
          }
          description={t('knowledge.noWorkspaceDescription', {
            defaultValue: '选择一个可访问的工作区后，即可读取来源详情。'
          })}
          title={t('knowledge.noWorkspaceTitle', { defaultValue: '尚未选择工作区' })}
        />
      </div>
    )
  }

  return (
    <KnowledgeSourceDetail
      authority={currentDetail.authority}
      key={`${selectionRevision}:${currentDetail.authority.source.id}`}
      onRefresh={refreshSource}
      workspaceName={currentDetail.workspaceName}
    />
  )
}
