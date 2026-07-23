/** @file 绑定 Workspace 的 Resume 创建表单 / Workspace-bound Resume-creation form. */

import { FilePlus2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  useAsyncResource,
  useResumeCreation,
  useResumeTemplateCatalog,
  useWorkspaceSession
} from '../../../../app/AppData'
import { runDiagnosticCommand, useDiagnostics } from '../../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../../app/resource-errors'
import { createUiCommandId } from '../../../../shared-kernel/command'
import type { UiWorkspaceId } from '../../../../shared-kernel/identity'
import { LoadingState } from '../../../../ui'
import {
  createResumeFromTemplate,
  loadResumeCreationTemplatePage
} from '../../application/resume-creation'
import type { UiTemplateManifest } from '../../domain/models'
import { TemplateOptionCollection } from './TemplateOptionCollection'
import {
  createResumeCreationFingerprint,
  getInitialTemplate,
  isContentLocale,
  RESUME_CREATION_TEMPLATE_PAGE_LIMIT,
  RESUME_TITLE_MAX_LENGTH,
  toTemplateReference,
  type ResumeCreationAttempt,
  type ResumeCreationSubmissionState,
  type ResumeCreationTemplateAuthority,
  type ResumeTemplateSelection
} from './creation-model'

/** @brief 已加载 Workspace 的创建表单属性 / Properties for the creation form in a loaded Workspace. */
interface ResumeCreationFormProps {
  /** @brief 创建表单所属的 Workspace / Workspace owning the creation form. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 显示用 Workspace 名称 / Workspace name used for display. */
  readonly workspaceName: string
  /** @brief 创建表单绑定的 Workspace 选择修订 / Workspace-selection revision bound to the form. */
  readonly selectionRevision: number
}

/**
 * @brief 呈现并提交绑定一个 Workspace 的 Resume 创建表单 / Present and submit a Resume-creation form bound to one Workspace.
 * @param props Workspace 身份、名称与选择修订 / Workspace identity, name, and selection revision.
 * @return 可分页选择 Template 且安全重试的创建表单 / Creation form with paginated Template selection and safe retries.
 */
export function ResumeCreationForm({
  selectionRevision,
  workspaceId,
  workspaceName
}: ResumeCreationFormProps): React.JSX.Element {
  /** @brief 翻译函数与当前应用语言 / Translation function and current application locale. */
  const { i18n, t } = useTranslation()
  /** @brief 创建成功后的路由导航器 / Route navigator used after successful creation. */
  const navigate = useNavigate()
  /** @brief 全局 Template 目录端口 / Global Template-catalog port. */
  const catalog = useResumeTemplateCatalog()
  /** @brief Workspace-scoped Resume 创建端口 / Workspace-scoped Resume-creation port. */
  const creation = useResumeCreation()
  /** @brief Workspace 会话，用于拒绝切换后的迟到命令结果 / Workspace session used to reject late command results after a switch. */
  const workspaceSession = useWorkspaceSession()
  /** @brief 结构化诊断端口 / Structured diagnostics port. */
  const diagnostics = useDiagnostics()
  /** @brief 用户输入的 Resume 标题 / User-entered Resume title. */
  const [title, setTitle] = useState('')
  /** @brief 用户输入的 Resume 内容语言 / User-entered Resume-content locale. */
  const [localeInput, setLocaleInput] = useState(() => i18n.resolvedLanguage ?? i18n.language)
  /** @brief 绑定到当前目录代际的显式 Template 选择 / Explicit Template selection bound to the current catalog generation. */
  const [templateSelection, setTemplateSelection] = useState<ResumeTemplateSelection | null>(null)
  /** @brief 是否应显示表单校验反馈 / Whether form-validation feedback should be shown. */
  const [showValidation, setShowValidation] = useState(false)
  /** @brief 当前创建提交状态 / Current creation-submission state. */
  const [submission, setSubmission] = useState<ResumeCreationSubmissionState>({ status: 'idle' })
  /** @brief 当前首页读取代际生成器 / Generator for first-page read generations. */
  const catalogGeneration = useRef(0)
  /** @brief 当前创建写入的取消控制器 / Cancellation controller for the current creation write. */
  const creationController = useRef<AbortController | null>(null)
  /** @brief 当前表单意图绑定的稳定命令 ID / Stable command ID bound to the current form intent. */
  const creationAttempt = useRef<ResumeCreationAttempt | null>(null)
  /** @brief 去除用户偶然首尾空白后的内容语言 / Content locale without accidental surrounding whitespace. */
  const normalizedLocale = localeInput.trim()
  /** @brief 当前内容语言是否满足契约 / Whether the current content locale satisfies the contract. */
  const localeIsValid = isContentLocale(normalizedLocale)
  /** @brief 去除首尾空白后的提交标题 / Submitted title without surrounding whitespace. */
  const normalizedTitle = title.trim()
  /** @brief 标题的 JSON Schema code-point 数 / JSON Schema code-point count of the title. */
  const titleLength = [...normalizedTitle].length
  /** @brief 标题是否满足产品与契约边界 / Whether the title satisfies product and contract boundaries. */
  const titleIsValid = titleLength >= 1 && titleLength <= RESUME_TITLE_MAX_LENGTH

  /** @brief 使旧创建意图失效并清除旧失败 / Invalidate an old creation intent and clear its old failure. */
  const invalidateCreationIntent = useCallback((): void => {
    creationAttempt.current = null
    setSubmission((current) => (current.status === 'error' ? { status: 'idle' } : current))
  }, [])

  /** @brief 读取当前 Locale 的 Template 首页 / Read the first Template page for the current Locale. */
  const loadTemplateAuthority = useCallback(
    async (signal: AbortSignal): Promise<ResumeCreationTemplateAuthority> => {
      if (!isContentLocale(normalizedLocale)) return { kind: 'invalid-locale' }
      /** @brief 当前 Locale 的权威 Template 创建页 / Authoritative Template creation page for the current Locale. */
      const page = await loadResumeCreationTemplatePage(catalog, {
        cursor: null,
        limit: RESUME_CREATION_TEMPLATE_PAGE_LIMIT,
        resumeLocale: normalizedLocale,
        signal
      })
      signal.throwIfAborted()
      return { generation: (catalogGeneration.current += 1), kind: 'page', page }
    },
    [catalog, normalizedLocale]
  )
  /** @brief 随 Locale 变化取消旧请求的 Template 首页资源 / First-page Template resource aborting stale reads when Locale changes. */
  const templateAuthority = useAsyncResource(
    'resume.creation',
    loadTemplateAuthority,
    `${selectionRevision}:${normalizedLocale}`
  )
  /** @brief 成功目录读取的首页代际 / First-page generation of a successful catalog read. */
  const templateGeneration =
    templateAuthority.status === 'ready' && templateAuthority.data.kind === 'page'
      ? templateAuthority.data.generation
      : null
  /** @brief 当前权威首页建议的默认 Template / Default Template suggested by the current authoritative first page. */
  const initialTemplate =
    templateAuthority.status === 'ready' && templateAuthority.data.kind === 'page'
      ? getInitialTemplate(templateAuthority.data.page)
      : null
  /** @brief 当前目录代际内实际使用的 Template 选择 / Effective Template selection within the current catalog generation. */
  const selectedTemplate =
    templateSelection !== null && templateSelection.generation === templateGeneration
      ? templateSelection.template
      : initialTemplate

  useEffect(
    (): (() => void) => () => {
      creationController.current?.abort(
        new DOMException('Resume creation form identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 更新标题并开始新的创建意图 / Update the title and begin a new creation intent. */
  const changeTitle = (event: ChangeEvent<HTMLInputElement>): void => {
    setTitle(event.currentTarget.value)
    invalidateCreationIntent()
  }

  /** @brief 更新内容语言、清除旧选择并开始新的创建意图 / Update the content locale, clear the old selection, and begin a new creation intent. */
  const changeLocale = (event: ChangeEvent<HTMLInputElement>): void => {
    setLocaleInput(event.currentTarget.value)
    setTemplateSelection(null)
    invalidateCreationIntent()
  }

  /** @brief 选择精确 Template 版本并开始新的创建意图 / Select an exact Template version and begin a new creation intent. */
  const selectTemplate = useCallback(
    (template: UiTemplateManifest): void => {
      if (templateGeneration === null) return
      setTemplateSelection({
        generation: templateGeneration,
        template: toTemplateReference(template)
      })
      invalidateCreationIntent()
    },
    [invalidateCreationIntent, templateGeneration]
  )

  /** @brief 提交经本地校验且绑定稳定幂等键的创建命令 / Submit a locally validated creation command bound to a stable idempotency key. */
  const submitCreation = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setShowValidation(true)
    if (
      submission.status === 'submitting' ||
      !titleIsValid ||
      !isContentLocale(normalizedLocale) ||
      selectedTemplate === null ||
      templateAuthority.status !== 'ready' ||
      templateAuthority.data.kind !== 'page'
    ) {
      return
    }

    /** @brief 当前命令的不可变本地指纹 / Immutable local fingerprint for the current command. */
    const fingerprint = createResumeCreationFingerprint(
      workspaceId,
      normalizedTitle,
      normalizedLocale,
      selectedTemplate
    )
    /** @brief 同一表单意图复用、字段变化后新建的命令 ID / Command ID reused for the same form intent and renewed after field changes. */
    const commandId =
      creationAttempt.current?.fingerprint === fingerprint
        ? creationAttempt.current.commandId
        : createUiCommandId()
    creationAttempt.current = { commandId, fingerprint }

    /** @brief 本次写入专属取消控制器 / Cancellation controller dedicated to this write. */
    const controller = new AbortController()
    creationController.current = controller
    setSubmission({ status: 'submitting' })

    try {
      /** @brief 服务端确认的新 Resume 与强 ETag / New Resume and strong ETag confirmed by the service. */
      const result = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.create', scope: 'resume' },
        () =>
          createResumeFromTemplate(catalog, creation, {
            creationAttemptId: commandId,
            locale: normalizedLocale,
            signal: controller.signal,
            source: { kind: 'new' },
            template: selectedTemplate,
            title: normalizedTitle,
            workspaceId
          })
      )
      controller.signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      void navigate(`/resumes/${result.resource.id}/edit`, { replace: true })
    } catch (error: unknown) {
      if (
        !controller.signal.aborted &&
        workspaceSession.getSelectionRevision() === selectionRevision
      ) {
        setSubmission({ error, status: 'error' })
      }
    } finally {
      if (creationController.current === controller) creationController.current = null
    }
  }

  /** @brief 当前失败是否表示写入结果未知 / Whether the current failure represents an unknown write outcome. */
  const outcomeIsUnknown =
    submission.status === 'error' &&
    classifyResourceFailure(submission.error).kind === 'outcome-unknown'

  return (
    <div className="aw-resume-create-layout">
      <form className="aw-card aw-resume-create-form" noValidate onSubmit={submitCreation}>
        <section aria-labelledby="resume-create-basics" className="aw-resume-create-section">
          <div>
            <h2 className="aw-card-title" id="resume-create-basics">
              {t('resume.creation.basicsTitle', { defaultValue: '简历信息' })}
            </h2>
            <p className="aw-card-description">
              {t('resume.creation.basicsDescription', {
                defaultValue: '标题和内容语言会成为新简历的权威元数据。'
              })}
            </p>
          </div>

          <div className="aw-resume-create-field">
            <label htmlFor="resume-create-title">
              {t('resume.creation.titleLabel', { defaultValue: '简历标题' })}
            </label>
            <input
              aria-describedby="resume-create-title-help resume-create-title-error"
              aria-invalid={showValidation && !titleIsValid ? 'true' : undefined}
              autoComplete="off"
              disabled={submission.status === 'submitting'}
              id="resume-create-title"
              onChange={changeTitle}
              placeholder={t('resume.creation.titlePlaceholder', {
                defaultValue: '例如：前端工程师简历'
              })}
              required
              type="text"
              value={title}
            />
            <span className="aw-resume-create-field-help" id="resume-create-title-help">
              {t('resume.creation.titleCount', {
                count: titleLength,
                defaultValue: '{{count}} / 300 个字符'
              })}
            </span>
            <span className="aw-resume-create-field-error" id="resume-create-title-error">
              {showValidation && !titleIsValid
                ? t('resume.creation.titleError', {
                    defaultValue: '请输入 1 至 300 个字符的标题。'
                  })
                : ''}
            </span>
          </div>

          <div className="aw-resume-create-field">
            <label htmlFor="resume-create-locale">
              {t('resume.creation.localeLabel', { defaultValue: '内容语言' })}
            </label>
            <input
              aria-describedby="resume-create-locale-help resume-create-locale-error"
              aria-invalid={!localeIsValid ? 'true' : undefined}
              autoCapitalize="none"
              autoComplete="off"
              disabled={submission.status === 'submitting'}
              id="resume-create-locale"
              list="resume-create-common-locales"
              onChange={changeLocale}
              required
              spellCheck={false}
              type="text"
              value={localeInput}
            />
            <datalist id="resume-create-common-locales">
              <option value="zh-SG" />
              <option value="zh-CN" />
              <option value="en-US" />
              <option value="en-GB" />
            </datalist>
            <span className="aw-resume-create-field-help" id="resume-create-locale-help">
              {t('resume.creation.localeHelp', {
                defaultValue: '使用 BCP 47 语言标签；模板支持范围会随之更新。'
              })}
            </span>
            <span className="aw-resume-create-field-error" id="resume-create-locale-error">
              {!localeIsValid
                ? t('resume.creation.localeError', {
                    defaultValue: '请输入有效的 BCP 47 语言标签，例如 zh-SG 或 en-US。'
                  })
                : ''}
            </span>
          </div>
        </section>

        <fieldset className="aw-resume-create-section aw-resume-create-template-fieldset">
          <legend>
            <span className="aw-card-title">
              {t('resume.creation.templateTitle', { defaultValue: '选择模板' })}
            </span>
            <span className="aw-card-description">
              {t('resume.creation.templateDescription', {
                defaultValue: '选择一个精确且不可变的已发布版本；创建前会再次校验该版本。'
              })}
            </span>
          </legend>

          {templateAuthority.status === 'loading' ? (
            <LoadingState
              className="aw-resume-create-template-loading"
              label={t('resume.creation.loadingTemplates', {
                defaultValue: '正在加载模板目录…'
              })}
            />
          ) : templateAuthority.status === 'error' ? (
            <ResourceErrorState
              error={templateAuthority.error}
              onRetry={templateAuthority.retry}
              title={t('resume.creation.templateError', { defaultValue: '无法加载模板目录' })}
            />
          ) : templateAuthority.data.kind === 'invalid-locale' ? (
            <p className="aw-resume-create-template-guidance">
              {t('resume.creation.localeBeforeTemplates', {
                defaultValue: '输入有效的内容语言后，将显示所有模板及其语言兼容性。'
              })}
            </p>
          ) : (
            <TemplateOptionCollection
              applicationLocale={i18n.language}
              catalog={catalog}
              initialPage={templateAuthority.data.page}
              interactionDisabled={submission.status === 'submitting'}
              key={templateAuthority.data.generation}
              onSelect={selectTemplate}
              resumeLocale={normalizedLocale}
              selectedTemplate={selectedTemplate}
            />
          )}

          <span className="aw-resume-create-field-error">
            {showValidation && selectedTemplate === null
              ? t('resume.creation.templateRequired', {
                  defaultValue: '请选择一个支持当前内容语言的模板。'
                })
              : ''}
          </span>
        </fieldset>

        {submission.status === 'error' ? (
          <div className="aw-resume-create-submit-error" role="alert">
            <strong>
              {outcomeIsUnknown
                ? t('resume.creation.outcomeUnknownTitle', {
                    defaultValue: '创建结果尚未确认'
                  })
                : t('resume.creation.submitErrorTitle', { defaultValue: '无法创建简历' })}
            </strong>
            <p>
              <ResourceFailureMessage error={submission.error} />
            </p>
            <p>
              {outcomeIsUnknown
                ? t('resume.creation.outcomeUnknownRetry', {
                    defaultValue: '保持当前字段不变并重试时，会复用同一幂等命令来确认结果。'
                  })
                : t('resume.creation.retryPreservesIntent', {
                    defaultValue: '当前字段未变化时，重试会复用同一创建命令。'
                  })}
            </p>
          </div>
        ) : null}

        <div className="aw-resume-create-actions">
          <Link className="aw-quiet-button" to="/resumes">
            {t('common.cancel', { defaultValue: '取消' })}
          </Link>
          <button
            className="aw-primary-button"
            disabled={submission.status === 'submitting' || templateAuthority.status === 'loading'}
            type="submit"
          >
            <FilePlus2 aria-hidden="true" size={17} strokeWidth={1.8} />
            {submission.status === 'submitting'
              ? t('resume.creation.creating', { defaultValue: '正在创建…' })
              : submission.status === 'error'
                ? t('resume.creation.retryCreate', { defaultValue: '重试创建' })
                : t('resume.creation.create', { defaultValue: '创建并开始编辑' })}
          </button>
        </div>
      </form>

      <aside className="aw-card aw-resume-create-context" aria-labelledby="resume-create-context">
        <p className="aw-eyebrow">{workspaceName}</p>
        <h2 className="aw-card-title" id="resume-create-context">
          {t('resume.creation.contextTitle', { defaultValue: '创建边界' })}
        </h2>
        <p className="aw-card-description">
          {t('resume.creation.contextDescription', {
            defaultValue:
              '新简历只会写入当前工作区。模板来自全局不可变目录，创建成功后才会进入编辑器。'
          })}
        </p>
      </aside>
    </div>
  )
}
