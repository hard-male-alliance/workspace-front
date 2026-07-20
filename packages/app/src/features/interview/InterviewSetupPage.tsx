import { ArrowLeft, BookOpenCheck, Check, Mic, ShieldCheck } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { useAppGateways, useAsyncResource } from '../../app/AppData'
import { runDiagnosticCommand, useDiagnostics } from '../../app/Diagnostics'
import type {
  UiInterviewDifficulty,
  UiInterviewSetupModel,
  UiInterviewType,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiWorkspaceId
} from '../../domain'
import { ErrorState, LoadingState } from '../../ui'

interface InterviewSetupData {
  readonly workspaceId: UiWorkspaceId
  readonly setup: UiInterviewSetupModel
  readonly knowledgeSources: readonly UiKnowledgeSource[]
}

const durationOptions = [15, 30, 45, 60] as const
const typeOptions: readonly UiInterviewType[] = [
  'mixed',
  'behavioral',
  'technical',
  'system_design'
]
const difficultyOptions: readonly UiInterviewDifficulty[] = ['introductory', 'standard', 'advanced']
const customJobValue = '__custom__'

function InterviewSetupForm({ data }: { readonly data: InterviewSetupData }): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const navigate = useNavigate()
  const { interview } = useAppGateways()
  const initialJob = data.setup.jobTargets.at(0)
  const [jobTitle, setJobTitle] = useState(initialJob?.title ?? '')
  const [selectedJobValue, setSelectedJobValue] = useState(initialJob?.title ?? customJobValue)
  const [interviewType, setInterviewType] = useState<UiInterviewType>('mixed')
  const [difficulty, setDifficulty] = useState<UiInterviewDifficulty>('standard')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [focusPrompt, setFocusPrompt] = useState('')
  const [selectedKnowledge, setSelectedKnowledge] = useState<ReadonlySet<UiKnowledgeSourceId>>(
    () => new Set(data.knowledgeSources.map((source) => source.id))
  )
  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const allKnowledgeSelected =
    data.knowledgeSources.length > 0 && selectedKnowledge.size === data.knowledgeSources.length
  const selectedJob = useMemo(
    () => data.setup.jobTargets.find((job) => job.title === jobTitle) ?? null,
    [data.setup.jobTargets, jobTitle]
  )

  const toggleKnowledge = (sourceId: UiKnowledgeSourceId): void => {
    setSelectedKnowledge((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (jobTitle.trim().length === 0 || isSubmitting) return
    setSubmitting(true)
    setSubmitError(null)
    void runDiagnosticCommand(
      diagnostics,
      { operation: 'interview.create', scope: 'interview' },
      () =>
        interview.createInterview({
          workspaceId: data.workspaceId,
          jobTarget: selectedJob ?? {
            title: jobTitle.trim(),
            company: null,
            location: null,
            seniority: null,
            skills: []
          },
          interviewType,
          difficulty,
          durationMinutes,
          knowledgeSourceIds: [...selectedKnowledge],
          focusPrompt: focusPrompt.trim() || null
        })
    )
      .then(({ sessionId }) => navigate(`/interviews/${sessionId}`))
      .catch(() => {
        setSubmitError(
          t('interviewSetup.submitError', { defaultValue: '无法创建面试，请保留当前设置并重试。' })
        )
        setSubmitting(false)
      })
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
          <span className="aw-status aw-status--active">Mock</span>
        </div>
        <div className="aw-interview-form-grid">
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.targetRole', { defaultValue: '目标岗位' })}
            </span>
            <select
              aria-label={t('interviewSetup.targetRole', { defaultValue: '目标岗位' })}
              className="aw-select"
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
              {t('interviewSetup.type', { defaultValue: '面试类型' })}
            </span>
            <select
              className="aw-select"
              onChange={(event) => setInterviewType(event.target.value as UiInterviewType)}
              value={interviewType}
            >
              {typeOptions.map((value) => (
                <option key={value} value={value}>
                  {t(`interviewTypes.${value}`, { defaultValue: value })}
                </option>
              ))}
            </select>
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.difficulty', { defaultValue: '难度' })}
            </span>
            <select
              className="aw-select"
              onChange={(event) => setDifficulty(event.target.value as UiInterviewDifficulty)}
              value={difficulty}
            >
              {difficultyOptions.map((value) => (
                <option key={value} value={value}>
                  {t(`interviewDifficulties.${value}`, { defaultValue: value })}
                </option>
              ))}
            </select>
          </label>
          <label className="aw-editor-field">
            <span className="aw-editor-label">
              {t('interviewSetup.duration', { defaultValue: '预计时长' })}
            </span>
            <select
              className="aw-select"
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              value={durationMinutes}
            >
              {durationOptions.map((value) => (
                <option key={value} value={value}>
                  {t('common.minutesValue', { count: value, defaultValue: `${value} 分钟` })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="aw-editor-field">
          <span className="aw-editor-label">
            {t('interviewSetup.focusPrompt', { defaultValue: '补充要求（可选）' })}
          </span>
          <input
            className="aw-text-input"
            maxLength={160}
            onChange={(event) => setFocusPrompt(event.target.value)}
            placeholder={t('interviewSetup.focusPlaceholder', {
              defaultValue: '例如：重点考察项目经历'
            })}
            value={focusPrompt}
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
          {t('interviewSetup.mockNotice', {
            defaultValue: '当前为界面演示，不会采集或发送真实麦克风音频。'
          })}
        </span>
      </div>
      {submitError !== null ? (
        <p className="aw-inline-error" role="alert">
          {submitError}
        </p>
      ) : null}
      <div className="aw-interview-setup-actions">
        <Link className="aw-quiet-button" to="/interviews">
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回' })}
        </Link>
        <button
          className="aw-primary-button"
          disabled={jobTitle.trim().length === 0 || isSubmitting}
          type="submit"
        >
          <Mic aria-hidden="true" size={16} />
          {isSubmitting
            ? t('interviewSetup.starting', { defaultValue: '正在准备…' })
            : t('interviewSetup.start', { defaultValue: '开始面试' })}
        </button>
      </div>
    </form>
  )
}

export function InterviewSetupPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { interview, knowledge, workspace } = useAppGateways()
  const loadSetup = useCallback(async (): Promise<InterviewSetupData> => {
    const currentWorkspace = (await workspace.listWorkspaces()).at(0)
    if (currentWorkspace === undefined)
      throw new Error('No workspace is available for interview setup.')
    const [setup, knowledgeSources] = await Promise.all([
      interview.getInterviewSetup(currentWorkspace.id),
      knowledge.listKnowledgeSources(currentWorkspace.id)
    ])
    return { workspaceId: currentWorkspace.id, setup, knowledgeSources }
  }, [interview, knowledge, workspace])
  const setup = useAsyncResource('interview.setup', loadSetup)

  if (setup.status === 'loading')
    return (
      <div className="aw-page">
        <LoadingState label={t('interviewSetup.loading', { defaultValue: '正在准备面试设置…' })} />
      </div>
    )
  if (setup.status === 'error')
    return (
      <div className="aw-page">
        <ErrorState
          description={t('interviewSetup.errorDescription', {
            defaultValue: '配置数据暂时不可用，请返回后重试。'
          })}
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
      <InterviewSetupForm data={setup.data} />
    </div>
  )
}
