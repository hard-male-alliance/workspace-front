import { ArrowLeft, BookOpenCheck, Check, Mic, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { useAsyncResource, useInterviewGateway, useInterviewSetupQuery } from '../../../app/AppData'
import type { InterviewSetupQueryResult } from '../../../app/AppQueries'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId } from '../../../shared-kernel/command'
import type { UiKnowledgeSourceId } from '../../knowledge'
import { LoadingState } from '../../../ui'
import type { UiCreateInterviewInput } from '../domain/models'

/** @brief 手动岗位选择的表单哨兵值 / Form sentinel for a manually entered job target. */
const customJobValue = '__custom__'

function InterviewSetupForm({
  data,
  onReloadAuthority
}: {
  readonly data: InterviewSetupQueryResult
  /** @brief 重新读取面试配置权威数据 / Reload authoritative Interview setup data. */
  readonly onReloadAuthority: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const navigate = useNavigate()
  const interview = useInterviewGateway()
  const initialJob = data.setup.jobTargets.at(0)
  const [jobTitle, setJobTitle] = useState(initialJob?.title ?? '')
  const [selectedJobValue, setSelectedJobValue] = useState(initialJob?.title ?? customJobValue)
  const [selectedScenarioId, setSelectedScenarioId] = useState(data.setup.scenarios.at(0)?.id ?? '')
  const [selectedKnowledge, setSelectedKnowledge] = useState<ReadonlySet<UiKnowledgeSourceId>>(
    () => new Set(data.knowledgeSources.map((source) => source.id))
  )
  const [isSubmitting, setSubmitting] = useState(false)
  /** @brief 最近一次创建命令错误 / Latest create-command error. */
  const [submitError, setSubmitError] = useState<unknown>(null)
  /** @brief 尚未确认结果的完整创建命令快照 / Complete creation-command snapshot whose outcome is unconfirmed. */
  const [unconfirmedCreation, setUnconfirmedCreation] = useState<UiCreateInterviewInput | null>(
    null
  )
  /** @brief 创建错误的安全类别 / Safe category of the create error. */
  const submitFailureKind = submitError === null ? null : classifyResourceFailure(submitError).kind
  /** @brief 是否必须以原命令确认创建结果 / Whether creation must be confirmed with the original command. */
  const creationOutcomeUnknown = unconfirmedCreation !== null
  /** @brief 当前失败是否要求重新读取配置而非盲目重放创建 / Whether the failure requires reloading setup instead of blindly replaying creation. */
  const creationAuthorityReloadRequired =
    submitFailureKind !== null &&
    ['authentication-required', 'forbidden', 'not-found', 'conflict', 'invalid-response'].includes(
      submitFailureKind
    )
  /** @brief 编辑控件是否需要冻结到当前命令快照 / Whether editors must remain frozen to the current command snapshot. */
  const configurationLocked =
    isSubmitting || creationOutcomeUnknown || creationAuthorityReloadRequired
  const allKnowledgeSelected =
    data.knowledgeSources.length > 0 && selectedKnowledge.size === data.knowledgeSources.length
  const selectedJob = useMemo(
    () => data.setup.jobTargets.find((job) => job.title === jobTitle) ?? null,
    [data.setup.jobTargets, jobTitle]
  )
  const selectedScenario = useMemo(
    () => data.setup.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [data.setup.scenarios, selectedScenarioId]
  )

  /**
   * @brief 切换一个知识来源的选择状态 / Toggle one Knowledge-source selection.
   * @param sourceId 知识来源 ID / Knowledge-source ID.
   * @return 无返回值 / No return value.
   */
  const toggleKnowledge = (sourceId: UiKnowledgeSourceId): void => {
    setSelectedKnowledge((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  /**
   * @brief 执行或确认同一个创建命令 / Execute or confirm the same creation command.
   * @param input 不可变的完整创建输入 / Immutable complete creation input.
   * @return 无返回值 / No return value.
   * @note 只有结果仍未知时保留原快照；服务端明确拒绝后可以开始新的用户意图。 / Retain the original snapshot only while the outcome remains unknown; a definitive rejection permits a new user intent.
   */
  const executeCreation = (input: UiCreateInterviewInput): void => {
    setSubmitting(true)
    setSubmitError(null)
    void runDiagnosticCommand(
      diagnostics,
      { operation: 'interview.create', scope: 'interview' },
      () => interview.createInterview(input)
    )
      .then(({ sessionId }) => navigate(`/interviews/${sessionId}`))
      .catch((error: unknown) => {
        /** @brief 不含技术细节的失败类别 / Failure category without technical details. */
        const failureKind = classifyResourceFailure(error).kind
        setSubmitError(error)
        setUnconfirmedCreation(failureKind === 'outcome-unknown' ? input : null)
        setSubmitting(false)
      })
  }

  /**
   * @brief 将当前表单冻结为一个新的创建命令 / Freeze the current form as one new creation command.
   * @param event 表单提交事件 / Form-submit event.
   * @return 无返回值 / No return value.
   */
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (
      jobTitle.trim().length === 0 ||
      selectedScenario === null ||
      isSubmitting ||
      creationOutcomeUnknown
    )
      return
    /** @brief 当前用户意图的不可变创建快照 / Immutable creation snapshot for the current user intent. */
    const input: UiCreateInterviewInput = {
      commandId: createUiCommandId(),
      workspaceId: data.workspaceId,
      jobTarget: selectedJob ?? {
        title: jobTitle.trim(),
        company: null,
        location: null,
        seniority: null,
        skills: []
      },
      scenarioId: selectedScenario.id,
      knowledgeSourceIds: [...selectedKnowledge]
    }
    executeCreation(input)
  }

  /**
   * @brief 以原始身份和请求体确认上次创建 / Confirm the previous creation with its original identity and body.
   * @return 无返回值 / No return value.
   */
  const confirmCreation = (): void => {
    if (unconfirmedCreation === null || isSubmitting) return
    executeCreation(unconfirmedCreation)
  }

  return (
    <form className="aw-interview-setup-form" onSubmit={submit}>
      <section className="aw-interview-setup-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSetup.basics', { defaultValue: '面试设置' })}</h2>
            <p>
              {t('interviewSetup.basicsDescription', {
                defaultValue: '保持简单，开始后由 AI 根据回答动态追问。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-interview-form-grid">
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.targetRole', { defaultValue: '目标岗位' })}
            </span>
            <select
              aria-label={t('interviewSetup.targetRole', { defaultValue: '目标岗位' })}
              className="aw-select"
              disabled={configurationLocked}
              onChange={(event) => {
                const value = event.target.value
                setSelectedJobValue(value)
                setJobTitle(value === customJobValue ? '' : value)
              }}
              value={selectedJobValue}
            >
              {data.setup.jobTargets.map((job) => (
                <option key={job.title} value={job.title}>
                  {job.title}
                </option>
              ))}
              <option value={customJobValue}>
                {t('interviewSetup.customRoleOption', { defaultValue: '手动输入其他岗位' })}
              </option>
            </select>
          </label>
          {selectedJobValue === customJobValue ? (
            <label className="aw-editor-field">
              <span className="aw-editor-label">
                {t('interviewSetup.customRoleLabel', { defaultValue: '手动输入目标岗位' })}
              </span>
              <input
                autoFocus
                className="aw-text-input"
                disabled={configurationLocked}
                maxLength={80}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder={t('interviewSetup.customRolePlaceholder', {
                  defaultValue: '例如：前端开发实习生'
                })}
                value={jobTitle}
              />
            </label>
          ) : null}
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.scenario', { defaultValue: '练习场景' })}
            </span>
            <select
              className="aw-select"
              disabled={configurationLocked || data.setup.scenarios.length === 0}
              onChange={(event) => setSelectedScenarioId(event.target.value)}
              value={selectedScenarioId}
            >
              {data.setup.scenarios.length === 0 ? (
                <option value="">
                  {t('interviewSetup.noScenarios', { defaultValue: '没有可用场景' })}
                </option>
              ) : null}
              {data.setup.scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.type', { defaultValue: '面试类型' })}
            </span>
            <input
              className="aw-text-input"
              readOnly
              value={
                selectedScenario === null
                  ? '—'
                  : t(`interviewTypes.${selectedScenario.interviewType}`, {
                      defaultValue: selectedScenario.interviewType
                    })
              }
            />
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.difficulty', { defaultValue: '难度' })}
            </span>
            <input
              className="aw-text-input"
              readOnly
              value={
                selectedScenario === null
                  ? '—'
                  : t(`interviewDifficulties.${selectedScenario.difficulty}`, {
                      defaultValue: selectedScenario.difficulty
                    })
              }
            />
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.duration', { defaultValue: '预计时长' })}
            </span>
            <input
              className="aw-text-input"
              readOnly
              value={
                selectedScenario === null
                  ? '—'
                  : t('common.minutesValue', {
                      count: selectedScenario.durationMinutes,
                      defaultValue: `${selectedScenario.durationMinutes} 分钟`
                    })
              }
            />
          </label>
        </div>
        <label className="aw-editor-field">
          <span className="aw-editor-label">
            {t('interviewSetup.focusPrompt', { defaultValue: '补充要求（可选）' })}
          </span>
          <input
            className="aw-text-input"
            disabled
            placeholder={t('interviewSetup.focusUnavailable', {
              defaultValue: '当前 API 契约尚未支持补充要求'
            })}
          />
        </label>
      </section>

      <section className="aw-interview-setup-section">
        <div className="aw-section-heading">
          <div>
            <h2>
              <BookOpenCheck aria-hidden="true" size={18} />
              {t('interviewSetup.knowledge', { defaultValue: '本次使用的知识资料' })}
            </h2>
            <p>
              {t('interviewSetup.knowledgeDescription', {
                defaultValue: '默认全选；最终可访问范围仍由后端权限策略决定。'
              })}
            </p>
          </div>
          {data.knowledgeSources.length > 0 ? (
            <button
              className="aw-quiet-button"
              disabled={configurationLocked}
              onClick={() =>
                setSelectedKnowledge(
                  allKnowledgeSelected
                    ? new Set()
                    : new Set(data.knowledgeSources.map((source) => source.id))
                )
              }
              type="button"
            >
              <Check aria-hidden="true" size={14} />
              {allKnowledgeSelected
                ? t('interviewSetup.clearAll', { defaultValue: '取消全选' })
                : t('interviewSetup.selectAll', { defaultValue: '全选' })}
            </button>
          ) : null}
        </div>
        {data.knowledgeSources.length === 0 ? (
          <p className="aw-interview-empty-note">
            {t('interviewSetup.noKnowledge', {
              defaultValue: '目前没有知识资料。本次仍可仅根据岗位和面试设置进行。'
            })}
          </p>
        ) : (
          <div className="aw-interview-knowledge-list">
            {data.knowledgeSources.map((source) => (
              <label className="aw-interview-knowledge-option" key={source.id}>
                <input
                  checked={selectedKnowledge.has(source.id)}
                  disabled={configurationLocked}
                  onChange={() => toggleKnowledge(source.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{source.name}</strong>
                  <small>{source.originLabel}</small>
                </span>
                <span className="aw-status">
                  {source.documentCount} {t('knowledge.documents', { defaultValue: '份文档' })}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <div className="aw-interview-setup-note">
        <ShieldCheck aria-hidden="true" size={16} />
        <span>
          {data.setup.realtimeAvailable
            ? t('interviewSetup.capabilityNotice', {
                defaultValue: '实时传输可用时才会创建会话；未就绪时不会创建无法使用的会话。'
              })
            : t('interviewSetup.realtimeUnavailableNotice', {
                defaultValue: '实时面试连接尚未就绪；当前不会创建无法使用的会话。'
              })}
        </span>
      </div>
      {submitError !== null ? (
        <p className="aw-inline-error" role="alert">
          <strong>
            {creationOutcomeUnknown
              ? t('interviewSetup.outcomeUnknown', {
                  defaultValue: '上次创建结果尚未确认；当前设置已锁定。'
                })
              : submitFailureKind === 'capability-unavailable'
                ? t('interviewSetup.realtimeUnavailable', {
                    defaultValue: '实时面试连接尚未就绪，本次没有创建无法使用的会话。'
                  })
                : t('interviewSetup.submitError', {
                    defaultValue: '无法创建面试；当前设置仍保留。'
                  })}
          </strong>{' '}
          <ResourceFailureMessage error={submitError} />
          {creationAuthorityReloadRequired ? (
            <button className="aw-quiet-button" onClick={onReloadAuthority} type="button">
              {t('common.reloadLatest', { defaultValue: '重新加载最新数据' })}
            </button>
          ) : null}
        </p>
      ) : null}
      <div className="aw-interview-setup-actions">
        <Link
          aria-disabled={creationOutcomeUnknown}
          className="aw-quiet-button"
          onClick={(event): void => {
            if (creationOutcomeUnknown) event.preventDefault()
          }}
          to="/interviews"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回' })}
        </Link>
        {creationOutcomeUnknown ? (
          <button
            className="aw-primary-button"
            disabled={isSubmitting}
            onClick={confirmCreation}
            type="button"
          >
            <Mic aria-hidden="true" size={16} />
            {isSubmitting
              ? t('interviewSetup.confirming', { defaultValue: '正在确认…' })
              : t('interviewSetup.confirmCreation', { defaultValue: '确认上次创建结果' })}
          </button>
        ) : (
          <button
            className="aw-primary-button"
            disabled={
              jobTitle.trim().length === 0 ||
              selectedScenario === null ||
              !data.setup.realtimeAvailable ||
              isSubmitting ||
              creationAuthorityReloadRequired
            }
            type="submit"
          >
            <Mic aria-hidden="true" size={16} />
            {isSubmitting
              ? t('interviewSetup.starting', { defaultValue: '正在准备…' })
              : t('interviewSetup.start', { defaultValue: '开始面试' })}
          </button>
        )}
      </div>
    </form>
  )
}

export function InterviewSetupPage(): React.JSX.Element {
  const { t } = useTranslation()
  /** @brief 应用层聚合后的 Interview 配置查询 / Interview-setup query aggregated by the application layer. */
  const query = useInterviewSetupQuery()
  const setup = useAsyncResource('interview.setup', query.load)

  if (setup.status === 'loading')
    return (
      <div className="aw-page">
        <LoadingState label={t('interviewSetup.loading', { defaultValue: '正在准备面试设置…' })} />
      </div>
    )
  if (setup.status === 'error')
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={setup.error}
          onRetry={setup.retry}
          title={t('interviewSetup.error', { defaultValue: '无法加载面试设置' })}
        />
      </div>
    )

  return (
    <div className="aw-page aw-interview-setup-page">
      <div className="aw-page-header">
        <div>
          <h1 className="aw-page-title">
            {t('interviewSetup.title', { defaultValue: '配置模拟面试' })}
          </h1>
          <p className="aw-page-description">
            {t('interviewSetup.description', {
              defaultValue: '选择练习场景和资料，准备好后直接开始。'
            })}
          </p>
        </div>
      </div>
      <InterviewSetupForm data={setup.data} onReloadAuthority={setup.retry} />
    </div>
  )
}
