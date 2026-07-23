import { ArrowLeft, FilePlus2, Mic, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { useAsyncResource, useInterviewGateway, useWorkspaceSession } from '../../../app/AppData'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId } from '../../../shared-kernel/command'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { UiCreateInterviewSessionCommand } from '../application/requests'
import {
  asUiInterviewPageLimit,
  type UiInterviewScenario,
  type UiInterviewScenarioPage
} from '../domain/models'

/** @brief 配置页一次读取的场景数量 / Number of scenarios read per setup page. */
const INTERVIEW_SCENARIO_PAGE_LIMIT = asUiInterviewPageLimit(50)

/** @brief 当前转录同意文案版本 / Current transcript-consent copy version. */
const INTERVIEW_TRANSCRIPT_CONSENT_VERSION = 'interview-transcript-retention-2026-07'

/** @brief 创建命令不包含单次调用 AbortSignal 的冻结快照 / Frozen creation command without a per-call AbortSignal. */
type FrozenInterviewSessionCreation = Omit<UiCreateInterviewSessionCommand, 'signal'>

/** @brief 配置页首屏权威 / Initial setup-page authority. */
type InterviewSetupAuthority =
  | { readonly kind: 'no-workspace' }
  | {
      readonly kind: 'workspace'
      readonly dataRegion: 'cn' | 'global' | 'private_deployment'
      readonly page: UiInterviewScenarioPage
      readonly workspaceId: UiWorkspaceId
      readonly workspaceName: string
    }

/** @brief 场景后续页状态 / Scenario-continuation state. */
type ScenarioContinuation =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown }

/**
 * @brief 稳定合并场景而不改变服务端首次顺序 / Stably merge scenarios without changing first server order.
 * @param current 已加载场景 / Loaded scenarios.
 * @param incoming 后续页场景 / Scenarios from a following page.
 * @return 按 identity 去重的场景 / Scenarios deduplicated by identity.
 */
function mergeScenarios(
  current: readonly UiInterviewScenario[],
  incoming: readonly UiInterviewScenario[]
): readonly UiInterviewScenario[] {
  /** @brief 保持首次插入顺序的场景 map / Scenario map preserving first insertion order. */
  const byId = new Map(current.map((scenario) => [scenario.id, scenario]))
  for (const scenario of incoming) byId.set(scenario.id, scenario)
  return [...byId.values()]
}

/**
 * @brief 判断错误是否要求保留并确认原创建命令 / Determine whether an error requires retaining and confirming the original command.
 * @param error Gateway 抛出的错误 / Error thrown by the gateway.
 * @return 结果未知或服务端仍处理同一幂等命令时为 true / True for an unknown outcome or an in-progress idempotent command.
 */
function creationRequiresExactConfirmation(error: unknown): boolean {
  /** @brief 通用失败分类 / General failure classification. */
  const failure = classifyResourceFailure(error)
  if (failure.kind === 'outcome-unknown') return true
  if (typeof error !== 'object' || error === null || !('problem' in error)) return false
  /** @brief 可信 Problem 的最小结构 / Minimal shape of a trusted Problem. */
  const problem = (error as { readonly problem?: unknown }).problem
  return (
    typeof problem === 'object' &&
    problem !== null &&
    'code' in problem &&
    (problem as { readonly code?: unknown }).code === 'idempotency.in_progress'
  )
}

/** @brief Session 创建表单属性 / Session-creation form properties. */
interface InterviewSetupFormProps {
  /** @brief 当前 Workspace 模型数据区域 / Current Workspace model-data region. */
  readonly dataRegion: 'cn' | 'global' | 'private_deployment'
  /** @brief 已加载场景首页 / Loaded first scenario page. */
  readonly initialPage: UiInterviewScenarioPage
  /** @brief 当前 Workspace ID / Current Workspace ID. */
  readonly workspaceId: UiWorkspaceId
}

/**
 * @brief 创建一个完整但隐私保守的 API v2 Session / Create a complete, privacy-conservative API v2 Session.
 * @param props Workspace 与场景权威 / Workspace and scenario authority.
 * @return 可精确确认未知结果的创建表单 / Creation form capable of exactly confirming an unknown result.
 */
function InterviewSetupForm({
  dataRegion,
  initialPage,
  workspaceId
}: InterviewSetupFormProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 页面导航 / Page navigation. */
  const navigate = useNavigate()
  /** @brief Interview REST 端口 / Interview REST port. */
  const gateway = useInterviewGateway()
  /** @brief 应用诊断端口 / Application diagnostics port. */
  const diagnostics = useDiagnostics()
  /** @brief 已加载场景 / Loaded scenarios. */
  const [scenarios, setScenarios] = useState<readonly UiInterviewScenario[]>(initialPage.items)
  /** @brief 当前场景分页关系 / Current scenario page relation. */
  const [page, setPage] = useState<UiInterviewScenarioPage>(initialPage)
  /** @brief 场景后续页状态 / Scenario-continuation state. */
  const [continuation, setContinuation] = useState<ScenarioContinuation>({ status: 'idle' })
  /** @brief 当前场景追加请求 / Current scenario-continuation request. */
  const continuationController = useRef<AbortController | null>(null)
  /** @brief 已成功消费的 cursor / Successfully consumed cursors. */
  const consumedCursors = useRef(new Set<string>())
  /** @brief 当前已选择场景 / Currently selected scenario identity. */
  const [scenarioId, setScenarioId] = useState(
    initialPage.items.find((scenario) => scenario.status === 'active')?.id ?? ''
  )
  /** @brief 岗位名称 / Job title. */
  const [jobTitle, setJobTitle] = useState('')
  /** @brief 公司名称 / Company name. */
  const [company, setCompany] = useState('')
  /** @brief 是否保存文字转录 / Whether to retain a transcript. */
  const [storeTranscript, setStoreTranscript] = useState(false)
  /** @brief 当前是否发送创建请求 / Whether a creation request is in flight. */
  const [isSubmitting, setSubmitting] = useState(false)
  /** @brief 最近一次创建失败 / Latest creation failure. */
  const [submitError, setSubmitError] = useState<unknown>(null)
  /** @brief 必须原样确认的冻结命令 / Frozen command that must be confirmed unchanged. */
  const [pendingCreation, setPendingCreation] = useState<FrozenInterviewSessionCreation | null>(
    null
  )
  /** @brief 当前选中的 active 场景 / Currently selected active scenario. */
  const selectedScenario = useMemo(
    () =>
      scenarios.find((scenario) => scenario.id === scenarioId && scenario.status === 'active') ??
      null,
    [scenarioId, scenarios]
  )
  /** @brief 已加载的 active 场景 / Loaded active scenarios. */
  const activeScenarios = useMemo(
    () => scenarios.filter((scenario) => scenario.status === 'active'),
    [scenarios]
  )
  /** @brief 选择与正文编辑是否被同一用户意图冻结 / Whether inputs are frozen to one user intent. */
  const locked = isSubmitting || pendingCreation !== null

  useEffect(
    (): (() => void) => () => {
      continuationController.current?.abort(
        new DOMException('Interview setup identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 读取更多场景且精确复用失败 cursor / Load more scenarios while exactly reusing a failed cursor. */
  const loadMoreScenarios = useCallback(async (): Promise<void> => {
    if (!page.hasMore || continuation.status === 'loading' || continuationController.current) return
    /** @brief 本次调用绑定的 cursor / Cursor bound to this call. */
    const cursor = page.nextCursor
    /** @brief 本次调用控制器 / Controller for this call. */
    const controller = new AbortController()
    continuationController.current = controller
    setContinuation({ status: 'loading' })
    try {
      /** @brief 权威后续场景页 / Authoritative following scenario page. */
      const nextPage = await gateway.listInterviewScenarioPage({
        cursor,
        limit: INTERVIEW_SCENARIO_PAGE_LIMIT,
        signal: controller.signal,
        workspaceId
      })
      if (
        consumedCursors.current.has(cursor) ||
        (nextPage.hasMore &&
          (nextPage.nextCursor === cursor || consumedCursors.current.has(nextPage.nextCursor)))
      ) {
        throw new Error('The Interview scenario pagination cursor did not advance.')
      }
      consumedCursors.current.add(cursor)
      setScenarios((current) => mergeScenarios(current, nextPage.items))
      setPage(nextPage)
      setContinuation({ status: 'idle' })
      if (scenarioId.length === 0) {
        /** @brief 新页面中首个可用场景 / First available scenario from the new page. */
        const nextActive = nextPage.items.find((scenario) => scenario.status === 'active')
        if (nextActive !== undefined) setScenarioId(nextActive.id)
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) setContinuation({ error, status: 'error' })
    } finally {
      if (continuationController.current === controller) continuationController.current = null
    }
  }, [continuation.status, gateway, page, scenarioId.length, workspaceId])

  /**
   * @brief 发送或确认同一个冻结创建命令 / Dispatch or confirm the same frozen creation command.
   * @param frozen 不含调用信号的完整命令 / Complete command without a call signal.
   */
  const executeCreation = (frozen: FrozenInterviewSessionCreation): void => {
    if (isSubmitting) return
    /** @brief 当前调用生命周期 / Current call lifecycle. */
    const controller = new AbortController()
    setSubmitting(true)
    setSubmitError(null)
    void runDiagnosticCommand(
      diagnostics,
      { operation: 'interview.create', scope: 'interview' },
      () => gateway.createInterviewSession({ ...frozen, signal: controller.signal })
    )
      .then((authority): void => {
        setPendingCreation(null)
        void navigate(`/interviews/${authority.session.id}`)
      })
      .catch((error: unknown): void => {
        setSubmitError(error)
        setPendingCreation(creationRequiresExactConfirmation(error) ? frozen : null)
        setSubmitting(false)
      })
  }

  /**
   * @brief 冻结当前表单为一个新的 Session 创建意图 / Freeze the current form as a new Session-creation intent.
   * @param event 表单提交事件 / Form-submit event.
   */
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (selectedScenario === null || jobTitle.trim().length === 0 || locked) return
    /** @brief 此次用户意图的完整 canonical 命令 / Complete canonical command for this user intent. */
    const command: FrozenInterviewSessionCreation = {
      commandId: createUiCommandId(),
      input: {
        inference: {
          allowExternalModelProcessing: false,
          allowProviderFallback: false,
          costTier: 'standard',
          dataRegion,
          latencyBudgetMs: null,
          qualityTier: 'balanced'
        },
        jobTarget: {
          company: company.trim().length === 0 ? null : company.trim(),
          description: null,
          location: null,
          seniority: null,
          skills: [],
          sourceUrl: null,
          title: jobTitle.trim()
        },
        knowledge: {
          agentScope: 'interview_coach',
          excludeSourceIds: [],
          includeSourceIds: [],
          mode: 'policy_default',
          pinnedVersions: []
        },
        locale: selectedScenario.locale,
        media: {
          avatar: {
            avatarId: null,
            includeExpressionCues: false,
            includeVisemes: false,
            outputMode: 'audio_only',
            preferredAudioCodecs: ['opus'],
            preferredVideoCodecs: [],
            voiceId: null
          },
          fallbackTransport: 'websocket',
          maxVideoFps: 30,
          maxVideoHeight: 720,
          maxVideoWidth: 1280,
          screenShare: false,
          userAudio: true,
          userVideo: false
        },
        recording: {
          consentVersion: storeTranscript ? INTERVIEW_TRANSCRIPT_CONSENT_VERSION : null,
          consentedAt: storeTranscript ? new Date().toISOString() : null,
          recordAudio: false,
          recordVideo: false,
          retentionDays: storeTranscript ? 30 : 0,
          storeTranscript
        },
        resumeRef: null,
        scenarioId: selectedScenario.id
      },
      workspaceId
    }
    executeCreation(command)
  }

  if (activeScenarios.length === 0 && !page.hasMore) {
    return (
      <EmptyState
        description={t('interviewSetup.noActiveDescription', {
          defaultValue: '当前工作区没有 active 场景。请先由管理员发布一个面试场景。'
        })}
        title={t('interviewSetup.noActiveTitle', { defaultValue: '没有可创建会话的场景' })}
        visual={<FilePlus2 aria-hidden="true" size={22} />}
      />
    )
  }

  return (
    <form className="aw-interview-setup-form" onSubmit={submit}>
      <section className="aw-interview-setup-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSetup.basics', { defaultValue: '练习设置' })}</h2>
            <p>
              {t('interviewSetup.basicsDescription', {
                defaultValue: '创建持久会话；实时连接会在真正进入练习时单独签发。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-interview-form-grid">
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.scenario', { defaultValue: '练习场景' })}
            </span>
            <select
              className="aw-select"
              disabled={locked || activeScenarios.length === 0}
              onChange={(event): void => setScenarioId(event.currentTarget.value)}
              value={scenarioId}
            >
              {activeScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.targetRole', { defaultValue: '目标岗位' })}
            </span>
            <input
              autoComplete="organization-title"
              className="aw-text-input"
              disabled={locked}
              maxLength={300}
              onChange={(event): void => setJobTitle(event.currentTarget.value)}
              placeholder={t('interviewSetup.targetRolePlaceholder', {
                defaultValue: '例如：前端开发工程师'
              })}
              required
              value={jobTitle}
            />
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.company', { defaultValue: '目标公司（可选）' })}
            </span>
            <input
              autoComplete="organization"
              className="aw-text-input"
              disabled={locked}
              maxLength={300}
              onChange={(event): void => setCompany(event.currentTarget.value)}
              value={company}
            />
          </label>
          {selectedScenario !== null ? (
            <div className="aw-interview-scenario-preview">
              <strong>{selectedScenario.name}</strong>
              <p>{selectedScenario.description}</p>
              <span>
                {selectedScenario.durationMinutes} {t('common.minutes', { defaultValue: '分钟' })} ·{' '}
                {selectedScenario.targetQuestionCount}{' '}
                {t('interviewSetup.questions', { defaultValue: '个目标问题' })}
              </span>
            </div>
          ) : null}
        </div>
        {page.hasMore ? (
          <div className="aw-inline-actions">
            <button
              className="aw-quiet-button"
              disabled={continuation.status === 'loading'}
              onClick={() => void loadMoreScenarios()}
              type="button"
            >
              {continuation.status === 'loading'
                ? t('interviewSetup.loadingMoreScenarios', { defaultValue: '正在加载场景…' })
                : t('interviewSetup.loadMoreScenarios', { defaultValue: '加载更多场景' })}
            </button>
          </div>
        ) : null}
        {continuation.status === 'error' ? (
          <div className="aw-inline-error" role="alert">
            <ResourceFailureMessage error={continuation.error} />
          </div>
        ) : null}
      </section>

      <section className="aw-interview-setup-section">
        <div className="aw-section-heading">
          <div>
            <h2>
              <ShieldCheck aria-hidden="true" size={18} />
              {t('interviewSetup.privacy', { defaultValue: '转录与隐私' })}
            </h2>
            <p>
              {t('interviewSetup.privacyDescription', {
                defaultValue: '音频和视频默认不录制；是否保存文字转录由你单独决定。'
              })}
            </p>
          </div>
        </div>
        <label className="aw-interview-consent-option">
          <input
            checked={storeTranscript}
            disabled={locked}
            onChange={(event): void => setStoreTranscript(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>
            <strong>
              {t('interviewSetup.storeTranscript', {
                defaultValue: '保存文字转录 30 天'
              })}
            </strong>
            <small>
              {t('interviewSetup.storeTranscriptDescription', {
                defaultValue: '用于生成报告并逐条核验评分证据；可以不勾选。'
              })}
            </small>
          </span>
        </label>
      </section>

      {submitError !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {pendingCreation !== null
              ? t('interviewSetup.outcomeUnknown', {
                  defaultValue: '上次创建结果尚未确认，设置已锁定。'
                })
              : t('interviewSetup.submitError', {
                  defaultValue: '未能创建会话，当前设置仍保留。'
                })}
          </strong>{' '}
          <ResourceFailureMessage error={submitError} />
        </div>
      ) : null}

      <div className="aw-interview-setup-actions">
        <Link
          aria-disabled={pendingCreation !== null}
          className="aw-quiet-button"
          onClick={(event): void => {
            if (pendingCreation !== null) event.preventDefault()
          }}
          to="/interviews"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回' })}
        </Link>
        {pendingCreation !== null ? (
          <button
            className="aw-primary-button"
            disabled={isSubmitting}
            onClick={(): void => executeCreation(pendingCreation)}
            type="button"
          >
            <Mic aria-hidden="true" size={16} />
            {isSubmitting
              ? t('interviewSetup.confirming', { defaultValue: '正在确认…' })
              : t('interviewSetup.confirmCreation', { defaultValue: '确认上次创建结果' })}
          </button>
        ) : (
          <button
            aria-busy={isSubmitting}
            className="aw-primary-button"
            disabled={selectedScenario === null || jobTitle.trim().length === 0 || isSubmitting}
            type="submit"
          >
            <FilePlus2 aria-hidden="true" size={16} />
            {isSubmitting
              ? t('interviewSetup.creating', { defaultValue: '正在创建…' })
              : t('interviewSetup.create', { defaultValue: '创建练习会话' })}
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * @brief API v2 InterviewSession 创建页 / API v2 InterviewSession creation page.
 * @return 当前 Workspace 的真实 Scenario 驱动表单 / Form driven by real Scenarios in the current Workspace.
 */
export function InterviewSetupPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief Interview REST 端口 / Interview REST port. */
  const gateway = useInterviewGateway()
  /** @brief Workspace 会话 / Workspace session. */
  const workspaceSession = useWorkspaceSession()
  /** @brief Workspace 选择修订 / Workspace-selection revision. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 读取当前 Workspace 与场景首页 / Read the current Workspace and first scenario page. */
  const loadSetup = useCallback(
    async (signal: AbortSignal): Promise<InterviewSetupAuthority> => {
      /** @brief 当前访问权威 / Current access authority. */
      const access = await workspaceSession.getAccess()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      /** @brief 当前显式选择的 Workspace / Current explicitly selected Workspace. */
      const current = access.currentWorkspaceAccess
      if (current === undefined) return { kind: 'no-workspace' }
      /** @brief 当前 Workspace 的场景首页 / First scenario page in the current Workspace. */
      const page = await gateway.listInterviewScenarioPage({
        cursor: null,
        limit: INTERVIEW_SCENARIO_PAGE_LIMIT,
        signal,
        workspaceId: current.workspace.id
      })
      return {
        dataRegion: current.workspace.dataRegion,
        kind: 'workspace',
        page,
        workspaceId: current.workspace.id,
        workspaceName: current.workspace.name
      }
    },
    [gateway, selectionRevision, workspaceSession]
  )
  /** @brief 配置页异步权威 / Asynchronous setup-page authority. */
  const authority = useAsyncResource('interview.setup', loadSetup, selectionRevision)

  if (authority.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('interviewSetup.loading', { defaultValue: '正在加载面试场景…' })} />
      </div>
    )
  }
  if (authority.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={authority.error}
          onRetry={authority.retry}
          title={t('interviewSetup.error', { defaultValue: '无法加载面试设置' })}
        />
      </div>
    )
  }
  if (authority.data.kind === 'no-workspace') {
    return (
      <div className="aw-page">
        <EmptyState
          description={t('interviewSetup.noWorkspaceDescription', {
            defaultValue: '选择工作区后即可创建练习会话。'
          })}
          title={t('interviewSetup.noWorkspaceTitle', { defaultValue: '尚未选择工作区' })}
          visual={<FilePlus2 aria-hidden="true" size={22} />}
        />
      </div>
    )
  }

  return (
    <div className="aw-page aw-interview-setup-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{authority.data.workspaceName}</p>
          <h1 className="aw-page-title">
            {t('interviewSetup.title', { defaultValue: '创建练习会话' })}
          </h1>
          <p className="aw-page-description">
            {t('interviewSetup.description', {
              defaultValue: '先保存场景、岗位与隐私选择，再进入会话生命周期。'
            })}
          </p>
        </div>
      </div>
      <InterviewSetupForm
        dataRegion={authority.data.dataRegion}
        initialPage={authority.data.page}
        key={`${selectionRevision}:${authority.data.workspaceId}`}
        workspaceId={authority.data.workspaceId}
      />
    </div>
  )
}
