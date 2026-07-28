import { ArrowLeft, FilePlus2, Mic, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  useAsyncResource,
  useInterviewGateway,
  useInterviewSetupQuery,
  useWorkspaceSession
} from '../../../app/AppData'
import type { InterviewKnowledgeMaterial } from '../../../app/AppQueries'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId } from '../../../shared-kernel/command'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { InterviewGateway } from '../application/gateway'
import type { UiCreateInterviewSessionCommand } from '../application/requests'
import {
  asUiInterviewType,
  asUiInterviewPageLimit,
  type UiInterviewScenario,
  type UiInterviewScenarioInput,
  type UiInterviewScenarioPage
} from '../domain/models'
import {
  SIX_DIMENSION_IDS,
  SIX_DIMENSION_RUBRIC_ID,
  SIX_DIMENSION_RUBRIC_VERSION
} from './six-dimension-rubric'

/** @brief 配置页一次读取的场景数量 / Number of scenarios read per setup page. */
const INTERVIEW_SCENARIO_PAGE_LIMIT = asUiInterviewPageLimit(50)

/** @brief 当前转录同意文案版本 / Current transcript-consent copy version. */
const INTERVIEW_TRANSCRIPT_CONSENT_VERSION = 'interview-transcript-retention-2026-07'
/** @brief 空工作区自动补齐的本地 Demo 场景名称 / Local Demo scenario name provisioned for an empty workspace. */
const DEMO_SCENARIO_NAME = '本地 Demo 六维面试'
/** @brief 本地 Demo 后端实际配置的模型执行区域 / Model execution region configured by the local Demo backend. */
const DEMO_MODEL_DATA_REGION = 'global'

/**
 * @brief 构造开箱即用的本地 Demo 面试场景 / Build the ready-to-use local Demo interview scenario.
 * @return 完整、隐私保守的场景输入 / Complete privacy-conservative scenario input.
 */
function demoInterviewScenarioInput(): UiInterviewScenarioInput {
  return {
    allowBargeIn: true,
    allowFollowups: true,
    description: '围绕岗位能力、问题解决、项目证据、沟通、协作与成长进行六维练习。',
    difficulty: 'intermediate',
    durationMinutes: 20,
    focusAreas: ['专业能力', '问题解决', '项目证据', '沟通表达', '协作推动', '学习成长'],
    interviewType: asUiInterviewType('general'),
    locale: 'zh-CN',
    name: DEMO_SCENARIO_NAME,
    rubric: {
      dimensions: [
        {
          description: '专业知识、技能和实践深度是否符合目标岗位。',
          dimensionId: SIX_DIMENSION_IDS[0],
          name: '专业能力与岗位匹配',
          observableIndicators: ['正确使用岗位相关概念', '说明实践边界与方案取舍'],
          scoringScale: { maximum: 100, minimum: 0 },
          weight: 0.25
        },
        {
          description: '能否拆解问题、识别约束并形成可验证的解决方案。',
          dimensionId: SIX_DIMENSION_IDS[1],
          name: '问题分析与解决能力',
          observableIndicators: ['澄清目标和约束', '比较方案并说明验证方法'],
          scoringScale: { maximum: 100, minimum: 0 },
          weight: 0.2
        },
        {
          description: '是否提供具体场景、个人行动和可核验的项目结果。',
          dimensionId: SIX_DIMENSION_IDS[2],
          name: '项目经历与成果证据',
          observableIndicators: ['区分个人贡献与团队成果', '给出结果、指标或复盘'],
          scoringScale: { maximum: 100, minimum: 0 },
          weight: 0.15
        },
        {
          description: '回答是否直接、清晰、有层次并能够回应追问。',
          dimensionId: SIX_DIMENSION_IDS[3],
          name: '沟通表达与结构',
          observableIndicators: ['直接回答并保持结构清楚', '追问后补充有效信息'],
          scoringScale: { maximum: 100, minimum: 0 },
          weight: 0.15
        },
        {
          description: '能否与他人协作、处理分歧并推动结果落地。',
          dimensionId: SIX_DIMENSION_IDS[4],
          name: '协作与推动能力',
          observableIndicators: ['说明协作角色和分歧处理', '主动同步风险并推动行动'],
          scoringScale: { maximum: 100, minimum: 0 },
          weight: 0.15
        },
        {
          description: '面对陌生问题、变化和失败时能否学习、调整和复盘。',
          dimensionId: SIX_DIMENSION_IDS[5],
          name: '学习适应与成长性',
          observableIndicators: ['识别知识缺口并主动验证', '根据反馈调整并迁移经验'],
          scoringScale: { maximum: 100, minimum: 0 },
          weight: 0.1
        }
      ],
      name: '本地 Demo 六维面试量表',
      overallScale: { maximum: 100, minimum: 0 },
      rubricId: SIX_DIMENSION_RUBRIC_ID,
      rubricVersion: SIX_DIMENSION_RUBRIC_VERSION
    },
    targetQuestionCount: 6
  }
}

/**
 * @brief 同一 Gateway 内共享本地 Demo 场景补齐流程 / Share local Demo Scenario provisioning within one Gateway.
 * @remarks Provisioning is a durable mutation and must finish even when a StrictMode probe unmounts its reader.
 */
const demoScenarioProvisioning = new WeakMap<
  InterviewGateway,
  Map<UiWorkspaceId, Promise<UiInterviewScenario>>
>()

/**
 * @brief 幂等创建并发布本地 Demo 场景 / Idempotently create and activate the local Demo Scenario.
 * @param gateway Interview Gateway.
 * @param workspaceId 当前工作区 / Current Workspace.
 * @param existingDraft 首次读取发现的草稿 / Draft found by the initial read.
 * @return 已发布场景 / Active Scenario.
 */
function provisionDemoInterviewScenario(
  gateway: InterviewGateway,
  workspaceId: UiWorkspaceId,
  existingDraft: UiInterviewScenario | undefined
): Promise<UiInterviewScenario> {
  let workspaceProvisioning = demoScenarioProvisioning.get(gateway)
  if (workspaceProvisioning === undefined) {
    workspaceProvisioning = new Map()
    demoScenarioProvisioning.set(gateway, workspaceProvisioning)
  }
  const existing = workspaceProvisioning.get(workspaceId)
  if (existing !== undefined) return existing

  const provisioning = (async (): Promise<UiInterviewScenario> => {
    const draft =
      existingDraft ??
      (
        await gateway.createInterviewScenario({
          commandId: createUiCommandId(),
          input: demoInterviewScenarioInput(),
          workspaceId
        })
      ).scenario
    if (draft.status === 'active') return draft
    const authority = await gateway.getInterviewScenario({
      scenarioId: draft.id,
      workspaceId
    })
    if (authority.scenario.status === 'active') return authority.scenario
    return (
      await gateway.updateInterviewScenario({
        concurrencyToken: authority.concurrencyToken,
        patch: { status: 'active' },
        scenarioId: draft.id,
        workspaceId
      })
    ).scenario
  })()
  workspaceProvisioning.set(workspaceId, provisioning)
  void provisioning.catch((): void => {
    if (workspaceProvisioning?.get(workspaceId) === provisioning) {
      workspaceProvisioning.delete(workspaceId)
    }
  })
  return provisioning
}

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
  initialPage,
  workspaceId
}: InterviewSetupFormProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 页面导航 / Page navigation. */
  const navigate = useNavigate()
  /** @brief Interview REST 端口 / Interview REST port. */
  const gateway = useInterviewGateway()
  const interviewSetupQuery = useInterviewSetupQuery()
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
  const [knowledgeSources, setKnowledgeSources] = useState<readonly InterviewKnowledgeMaterial[]>(
    []
  )
  const [selectedKnowledgeSourceIds, setSelectedKnowledgeSourceIds] = useState<
    ReadonlySet<InterviewKnowledgeMaterial['id']>
  >(new Set())
  const [knowledgeError, setKnowledgeError] = useState<unknown>(null)
  const [isLoadingKnowledge, setLoadingKnowledge] = useState(true)
  /** @brief 是否保存文字转录 / Whether to retain a transcript. */
  const storeTranscript = true
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

  useEffect((): (() => void) => {
    const controller = new AbortController()
    void (async (): Promise<void> => {
      setLoadingKnowledge(true)
      setKnowledgeError(null)
      try {
        const items = await interviewSetupQuery.listKnowledgeMaterials(
          workspaceId,
          controller.signal
        )
        if (!controller.signal.aborted) setKnowledgeSources(items)
      } catch (error: unknown) {
        if (!controller.signal.aborted) setKnowledgeError(error)
      } finally {
        if (!controller.signal.aborted) setLoadingKnowledge(false)
      }
    })()
    return (): void =>
      controller.abort(new DOMException('Interview Knowledge selection changed.', 'AbortError'))
  }, [interviewSetupQuery, workspaceId])

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
          allowExternalModelProcessing: true,
          allowProviderFallback: false,
          costTier: 'standard',
          dataRegion: DEMO_MODEL_DATA_REGION,
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
          includeSourceIds: [...selectedKnowledgeSourceIds],
          mode: selectedKnowledgeSourceIds.size === 0 ? 'none' : 'explicit',
          pinnedVersions: []
        },
        locale: selectedScenario.locale,
        media: {
          avatar: {
            avatarId: null,
            includeExpressionCues: false,
            includeVisemes: false,
            outputMode: 'none',
            preferredAudioCodecs: [],
            preferredVideoCodecs: [],
            voiceId: null
          },
          fallbackTransport: 'websocket',
          maxVideoFps: 30,
          maxVideoHeight: 720,
          maxVideoWidth: 1280,
          screenShare: false,
          userAudio: false,
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
            <h2>参考材料（可选）</h2>
            <p>只显示已完成摄取并明确授权给面试助手的材料；会话创建后本次版本将被冻结。</p>
          </div>
        </div>
        {isLoadingKnowledge ? <p className="aw-muted-copy">正在加载可用材料…</p> : null}
        {knowledgeError === null ? null : (
          <div className="aw-inline-error" role="alert">
            <ResourceFailureMessage error={knowledgeError} />
          </div>
        )}
        {!isLoadingKnowledge && knowledgeError === null && knowledgeSources.length === 0 ? (
          <p className="aw-muted-copy">当前没有可用于面试的已授权材料，可以直接开始通用面试。</p>
        ) : null}
        <div className="aw-interview-material-list">
          {knowledgeSources.map((source) => (
            <label className="aw-interview-consent-option" key={source.id}>
              <input
                checked={selectedKnowledgeSourceIds.has(source.id)}
                disabled={locked}
                onChange={(event): void => {
                  /** @brief React 释放事件对象前冻结的选中状态 / Checked state frozen before React releases the event object. */
                  const checked = event.currentTarget.checked
                  setSelectedKnowledgeSourceIds((current) => {
                    const next = new Set(current)
                    if (checked) next.add(source.id)
                    else next.delete(source.id)
                    return next
                  })
                }}
                type="checkbox"
              />
              <span>
                <strong>{source.name}</strong>
                <small>{source.sourceType}</small>
              </span>
            </label>
          ))}
        </div>
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
                defaultValue: '纯文字面试不录制音频或视频；问题和回答会保存为权威转录。'
              })}
            </p>
          </div>
        </div>
        <label className="aw-interview-consent-option">
          <input checked={storeTranscript} disabled readOnly type="checkbox" />
          <span>
            <strong>
              {t('interviewSetup.storeTranscript', {
                defaultValue: '保存文字转录 30 天'
              })}
            </strong>
            <small>
              {t('interviewSetup.storeTranscriptDescription', {
                defaultValue: '文字转录用于断线恢复、会话回看，以及后续可选的面试报告。'
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
      let page = await gateway.listInterviewScenarioPage({
        cursor: null,
        limit: INTERVIEW_SCENARIO_PAGE_LIMIT,
        signal,
        workspaceId: current.workspace.id
      })
      /** @brief 已存在但尚未发布的六维 Demo 场景，或刚创建的场景 / Existing draft six-dimension Demo scenario, or newly created scenario. */
      const active = await provisionDemoInterviewScenario(
        gateway,
        current.workspace.id,
        page.items.find(
          (scenario) =>
            scenario.name === DEMO_SCENARIO_NAME &&
            scenario.rubric.rubricId === SIX_DIMENSION_RUBRIC_ID &&
            scenario.rubric.rubricVersion === SIX_DIMENSION_RUBRIC_VERSION
        )
      )
      signal.throwIfAborted()
      page = {
        ...page,
        items: [active, ...page.items.filter((scenario) => scenario.id !== active.id)]
      }
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
        initialPage={authority.data.page}
        key={`${selectionRevision}:${authority.data.workspaceId}`}
        workspaceId={authority.data.workspaceId}
      />
    </div>
  )
}
