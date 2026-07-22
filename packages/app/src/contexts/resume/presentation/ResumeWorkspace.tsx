import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { useArtifactSave } from '../../../app/Host'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { getResumeConflictStatus, type ResumeConflictStatus } from '../application/errors'
import type { ResumeGateway } from '../application/gateway'
import type {
  UiResumeEditorModel,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiResumeSection,
  UiResumeSectionId,
  UiTemplateManifest
} from '../domain/models'

/** @brief 桌面简历工作台窗口 / Desktop resume-workspace pane. */
type ResumePane = 'assistant' | 'editor' | 'preview'

/** @brief 紧凑布局当前窗口 / Current pane in compact layouts. */
type MobileResumePane = 'edit' | 'preview'

/** @brief 尚未由服务端确认的板块草稿 / Section draft not yet confirmed by the server. */
interface ResumeSectionDraft {
  /** @brief 草稿正文 / Draft body. */
  readonly content: string
  /** @brief 草稿标题 / Draft title. */
  readonly title: string
}

/** @brief 板块保存失败及其恢复目标 / Section-save failure and its recovery target. */
interface ResumeSectionSaveFailure {
  /** @brief 未向用户直接展示的技术错误 / Technical error not displayed directly to the user. */
  readonly error: unknown
  /** @brief 需要重新保存的板块 / Section that needs to be saved again. */
  readonly sectionId: UiResumeSectionId
}

/** @brief 窗口顺序 / Stable pane order. */
const RESUME_PANES: readonly ResumePane[] = ['assistant', 'editor', 'preview']

/** @brief 初始等宽权重 / Initial equal pane weights. */
const INITIAL_PANE_SIZES: Readonly<Record<ResumePane, number>> = {
  assistant: 1,
  editor: 1,
  preview: 1
}

/** @brief 获取板块可编辑纯文本 / Get editable plain text for a section. */
function getSectionContent(section: UiResumeSection): string {
  return section.contentPreview ?? section.items.flatMap((item) => item.highlights).join('\n')
}

/** @brief 纸张中的语义板块 / Semantic section rendered on the paper preview. */
function ResumePaperSection({ section }: { readonly section: UiResumeSection }): React.JSX.Element {
  return (
    <section className="aw-paper-section">
      <h3>{section.title || section.kind}</h3>
      {section.contentPreview !== null && section.contentPreview.length > 0 ? (
        <p>{section.contentPreview}</p>
      ) : null}
      {section.items.map((item) => (
        <div className="aw-paper-entry" key={item.id}>
          <div className="aw-paper-entry-title">
            <span>{item.title}</span>
            {item.dateLabel !== null ? <span>{item.dateLabel}</span> : null}
          </div>
          {item.subtitle !== null ? <p>{item.subtitle}</p> : null}
          {item.highlights.length > 0 ? (
            <ul>
              {item.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  )
}

/** @brief 标题栏中的窗口开关 / Pane toggle inside the fixed window title bar. */
function ResumeWindowTitle({
  expanded,
  label,
  onToggle,
  trailing
}: {
  readonly expanded: boolean
  readonly label: string
  readonly onToggle: () => void
  readonly trailing?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={`aw-resume-window-title ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <h2>{label}</h2>
      <div className="aw-resume-window-actions">
        {trailing}
        <button
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t('resume.workspace.collapseWindow', {
                  defaultValue: '收起{{name}}窗口',
                  name: label
                })
              : t('resume.workspace.expandWindow', {
                  defaultValue: '展开{{name}}窗口',
                  name: label
                })
          }
          className="aw-icon-button aw-window-toggle"
          onClick={onToggle}
          type="button"
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" size={15} />
          ) : (
            <ChevronDown aria-hidden="true" size={15} />
          )}
        </button>
      </div>
    </div>
  )
}

/** @brief 可拖动且支持键盘的窗口分隔线 / Pointer- and keyboard-operable pane separator. */
function ResumePaneSeparator({
  leftPane,
  onResize,
  value
}: {
  readonly leftPane: ResumePane
  readonly onResize: (delta: number) => void
  readonly value: number
}): React.JSX.Element {
  const lastPointerX = useRef<number | null>(null)

  const stopPointerResize = (): void => {
    lastPointerX.current = null
    document.body.classList.remove('aw-is-resizing')
  }

  const handlePointerMove = (event: PointerEvent): void => {
    if (lastPointerX.current === null) {
      return
    }
    const delta = (event.clientX - lastPointerX.current) / Math.max(window.innerWidth, 1)
    lastPointerX.current = event.clientX
    onResize(delta * 3)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    lastPointerX.current = event.clientX
    document.body.classList.add('aw-is-resizing')
    const move = (pointerEvent: PointerEvent): void => handlePointerMove(pointerEvent)
    const up = (): void => {
      stopPointerResize()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    onResize(event.key === 'ArrowLeft' ? -0.05 : 0.05)
  }

  return (
    <div
      aria-label={`调整${leftPane}窗口宽度`}
      aria-orientation="vertical"
      aria-valuemax={85}
      aria-valuemin={15}
      aria-valuenow={Math.round(value * 100)}
      className="aw-resume-pane-separator"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="separator"
      tabIndex={0}
    />
  )
}

/** @brief AI 对话窗口 / Resume-assistant pane. */
function ResumeAssistantPanel({
  onCloseMobile
}: {
  readonly onCloseMobile: () => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <aside aria-label={t('resume.workspace.assistant', { defaultValue: 'AI 对话' })}>
      <div className="aw-mobile-assistant-header">
        <Bot aria-hidden="true" size={17} />
        <strong>{t('resume.workspace.assistant', { defaultValue: 'AI 对话' })}</strong>
        <button
          aria-label={t('common.close', { defaultValue: '关闭' })}
          className="aw-icon-button"
          onClick={onCloseMobile}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="aw-chat-messages" aria-live="polite">
        <p className="aw-workspace-context">
          <Sparkles aria-hidden="true" size={14} />
          {t('resume.workspace.assistantUnavailable', {
            defaultValue: 'Agent 消息与建议将在正式会话契约接通后开放。'
          })}
        </p>
      </div>
      <form
        aria-label={t('resume.assistantMessageForm', { defaultValue: '简历助手消息' })}
        className="aw-chat-composer"
      >
        <textarea
          aria-label={t('resume.workspace.askAssistantLabel', { defaultValue: '询问简历助手' })}
          className="aw-textarea"
          disabled
          placeholder={t('resume.askAssistant', {
            defaultValue: '简历助手将在 Agent 会话契约接通后开放。'
          })}
          value=""
        />
        <button
          aria-label={t('resume.sendMessage', { defaultValue: '发送消息' })}
          className="aw-icon-button aw-send-button"
          disabled
          type="submit"
        >
          <Send aria-hidden="true" size={16} />
        </button>
      </form>
    </aside>
  )
}

/** @brief 所有语义板块组成的连续编辑器 / Continuous editor for all semantic sections. */
function ResumeSectionsEditor({
  editor,
  gateway,
  isWriteLocked,
  onEditorChange,
  onMutationError
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly isWriteLocked: boolean
  readonly onEditorChange: (editor: UiResumeEditorModel) => void
  readonly onMutationError: (error: unknown) => boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const [focusedSectionId, setFocusedSectionId] = useState<UiResumeSectionId | null>(
    editor.resume.sections.at(0)?.id ?? null
  )
  const [deleteCandidate, setDeleteCandidate] = useState<UiResumeSectionId | null>(null)
  const [draggedSectionId, setDraggedSectionId] = useState<UiResumeSectionId | null>(null)
  /** @brief 仅存在于浏览器内、尚未被后端确认的板块草稿 / Browser-local section drafts not yet confirmed by the backend. */
  const [drafts, setDrafts] = useState<Readonly<Record<string, ResumeSectionDraft>>>({})
  /** @brief 当前正在保存的板块 / Section currently being persisted. */
  const [savingSectionId, setSavingSectionId] = useState<UiResumeSectionId | null>(null)
  /** @brief 最近一次板块保存失败 / Latest section-save failure. */
  const [saveFailure, setSaveFailure] = useState<ResumeSectionSaveFailure | null>(null)
  /** @brief 结构操作的安全用户错误 / Safe user-facing structural-operation error. */
  const [structureError, setStructureError] = useState<string | null>(null)

  const updateLocalSection = (
    sectionId: UiResumeSectionId,
    field: 'title' | 'content',
    value: string
  ): void => {
    if (isWriteLocked) return
    /** @brief 当前权威板块 / Current authoritative section. */
    const section = editor.resume.sections.find((item) => item.id === sectionId)
    if (section === undefined) return
    setSaveFailure(null)
    setDrafts((current) => {
      /** @brief 已有草稿或从权威投影初始化的草稿 / Existing draft or a draft initialized from the authoritative projection. */
      const draft = current[sectionId] ?? {
        content: getSectionContent(section),
        title: section.title
      }
      return {
        ...current,
        [sectionId]: {
          ...draft,
          [field]: value
        }
      }
    })
  }

  const persistSection = async (section: UiResumeSection): Promise<void> => {
    /** @brief 本次需要提交的草稿快照 / Draft snapshot to submit in this attempt. */
    const draft = drafts[section.id]
    if (draft === undefined || savingSectionId !== null || isWriteLocked) return
    setSavingSectionId(section.id)
    setSaveFailure(null)
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_update', scope: 'resume' },
        () =>
          gateway.updateResumeSection({
            resumeId: editor.resume.id,
            sectionId: section.id,
            title: draft.title,
            content: draft.content
          })
      )
      onEditorChange(next)
      setDrafts((current) => {
        /** @brief 已确认保存后保留的其它板块草稿 / Other section drafts retained after this save is confirmed. */
        const { [section.id]: _confirmed, ...remaining } = current
        void _confirmed
        return remaining
      })
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setSaveFailure({ error: reason, sectionId: section.id })
    } finally {
      setSavingSectionId(null)
    }
  }

  const reorder = async (orderedIds: readonly UiResumeSectionId[]): Promise<void> => {
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_reorder', scope: 'resume' },
        () =>
          gateway.reorderResumeSections({
            resumeId: editor.resume.id,
            orderedSectionIds: orderedIds
          })
      )
      onEditorChange(next)
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setStructureError(t('resume.workspace.reorderError', { defaultValue: '无法调整板块顺序。' }))
    }
  }

  const moveSection = (sectionId: UiResumeSectionId, offset: -1 | 1): void => {
    if (isWriteLocked) return
    const currentIndex = editor.resume.sections.findIndex((section) => section.id === sectionId)
    const targetIndex = currentIndex + offset
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= editor.resume.sections.length) {
      return
    }
    const orderedIds = editor.resume.sections.map((section) => section.id)
    const [movedId] = orderedIds.splice(currentIndex, 1)
    if (movedId === undefined) {
      return
    }
    orderedIds.splice(targetIndex, 0, movedId)
    void reorder(orderedIds)
  }

  const deleteSection = async (sectionId: UiResumeSectionId): Promise<void> => {
    if (isWriteLocked) return
    if (deleteCandidate !== sectionId) {
      setDeleteCandidate(sectionId)
      return
    }
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_delete', scope: 'resume' },
        () => gateway.deleteResumeSection({ resumeId: editor.resume.id, sectionId })
      )
      onEditorChange(next)
      setFocusedSectionId(next.resume.sections.at(0)?.id ?? null)
      setDeleteCandidate(null)
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setStructureError(t('resume.workspace.deleteError', { defaultValue: '无法删除这个板块。' }))
    }
  }

  const dropBefore = (targetId: UiResumeSectionId): void => {
    if (isWriteLocked) return
    if (draggedSectionId === null || draggedSectionId === targetId) {
      return
    }
    const orderedIds = editor.resume.sections
      .map((section) => section.id)
      .filter((sectionId) => sectionId !== draggedSectionId)
    const targetIndex = orderedIds.indexOf(targetId)
    orderedIds.splice(targetIndex, 0, draggedSectionId)
    setDraggedSectionId(null)
    void reorder(orderedIds)
  }

  return (
    <section aria-label={t('resume.workspace.editor', { defaultValue: '内容编辑' })}>
      <div className="aw-resume-editor-intro">
        <div>
          <strong>{editor.resume.title}</strong>
          <span>
            {t('resume.revision', {
              defaultValue: '版本 {{revision}}',
              revision: editor.resume.revision
            })}
          </span>
        </div>
        <p>
          {t('resume.workspace.editorHint', { defaultValue: '浏览全部板块，点击后聚焦编辑。' })}
        </p>
      </div>
      {structureError !== null ? (
        <div className="aw-inline-error" role="alert">
          {structureError}
        </div>
      ) : null}
      {saveFailure !== null ? (
        <ResourceErrorState
          error={saveFailure.error}
          onRetry={(): void => {
            /** @brief 仍存在于权威投影中的失败板块 / Failed section still present in the authoritative projection. */
            const section = editor.resume.sections.find((item) => item.id === saveFailure.sectionId)
            if (section !== undefined) void persistSection(section)
          }}
          title={t('resume.workspace.sectionError', {
            defaultValue: '板块修改尚未保存；你的输入仍保留在本页。'
          })}
        />
      ) : null}
      <div className="aw-resume-sections">
        {editor.resume.sections.map((section, index) => {
          const isFocused = section.id === focusedSectionId
          /** @brief 当前板块的未保存草稿 / Unsaved draft for the current section. */
          const draft = drafts[section.id]
          /** @brief 输入框展示的标题 / Title displayed in the input. */
          const sectionTitle = draft?.title ?? section.title
          /** @brief 输入框展示的正文 / Body displayed in the input. */
          const sectionContent = draft?.content ?? getSectionContent(section)
          /** @brief 当前板块是否正在保存 / Whether the current section is being saved. */
          const isSaving = savingSectionId === section.id
          return (
            <article
              className={`aw-resume-section-editor ${isFocused ? 'is-focused' : ''}`}
              draggable={!isWriteLocked}
              key={section.id}
              onClick={(): void => setFocusedSectionId(section.id)}
              onDragOver={(event): void => event.preventDefault()}
              onDragStart={(): void => setDraggedSectionId(section.id)}
              onDrop={(): void => dropBefore(section.id)}
            >
              <header className="aw-resume-section-heading">
                <span aria-hidden="true" className="aw-section-drag-handle">
                  <GripVertical size={15} />
                </span>
                <div>
                  <h3>{sectionTitle || section.kind}</h3>
                  <span>{section.kind}</span>
                </div>
                <div className="aw-section-actions">
                  <button
                    aria-label={t('resume.workspace.moveUp', {
                      defaultValue: '上移{{name}}',
                      name: sectionTitle
                    })}
                    className="aw-icon-button"
                    disabled={index === 0 || isWriteLocked || savingSectionId !== null}
                    onClick={(event): void => {
                      event.stopPropagation()
                      moveSection(section.id, -1)
                    }}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={t('resume.workspace.moveDown', {
                      defaultValue: '下移{{name}}',
                      name: sectionTitle
                    })}
                    className="aw-icon-button"
                    disabled={
                      index === editor.resume.sections.length - 1 ||
                      isWriteLocked ||
                      savingSectionId !== null
                    }
                    onClick={(event): void => {
                      event.stopPropagation()
                      moveSection(section.id, 1)
                    }}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={t('resume.workspace.deleteSection', {
                      defaultValue: '删除{{name}}',
                      name: sectionTitle
                    })}
                    className={`aw-icon-button ${deleteCandidate === section.id ? 'aw-danger-button' : ''}`}
                    disabled={isWriteLocked || savingSectionId !== null}
                    onClick={(event): void => {
                      event.stopPropagation()
                      void deleteSection(section.id)
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </div>
              </header>
              {isFocused ? (
                <div className="aw-section-focus-editor">
                  <label>
                    <span>{t('resume.editor.sectionTitle', { defaultValue: '区段标题' })}</span>
                    <input
                      className="aw-text-input"
                      disabled={isWriteLocked || isSaving}
                      onBlur={(): void => {
                        const current = editor.resume.sections.find(
                          (item) => item.id === section.id
                        )
                        if (current !== undefined) void persistSection(current)
                      }}
                      onChange={(event): void =>
                        updateLocalSection(section.id, 'title', event.target.value)
                      }
                      value={sectionTitle}
                    />
                  </label>
                  <label>
                    <span>{t('resume.editor.semanticContent', { defaultValue: '语义内容' })}</span>
                    <div className="aw-rich-text-shell">
                      <textarea
                        aria-label={t('resume.editor.semanticContent', {
                          defaultValue: '语义内容'
                        })}
                        className="aw-section-textarea"
                        disabled={isWriteLocked || isSaving}
                        onBlur={(): void => {
                          const current = editor.resume.sections.find(
                            (item) => item.id === section.id
                          )
                          if (current !== undefined) void persistSection(current)
                        }}
                        onChange={(event): void =>
                          updateLocalSection(section.id, 'content', event.target.value)
                        }
                        value={sectionContent}
                      />
                    </div>
                  </label>
                </div>
              ) : (
                <p className="aw-section-summary">
                  {sectionContent ||
                    t('resume.workspace.structuredItems', {
                      defaultValue: '包含 {{count}} 条结构化经历',
                      count: section.items.length
                    })}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** @brief PDF 视觉预览窗口 / PDF visual-preview pane. */
function ResumePreviewPanel({
  editor,
  gateway,
  initialArtifact
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly initialArtifact: UiResumePdfArtifact | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const artifactSave = useArtifactSave()
  const [artifact, setArtifact] = useState<UiResumePdfArtifact | null>(initialArtifact)
  const [job, setJob] = useState<UiResumeRenderJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setRendering] = useState(false)
  /** @brief PDF 产物是否正在由宿主保存 / Whether the PDF artifact is being saved by the host. */
  const [isSaving, setSaving] = useState(false)
  /** @brief 产物保存的可访问状态 / Accessible artifact-save status. */
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  /** @brief 产物保存失败消息 / Artifact-save failure message. */
  const [saveError, setSaveError] = useState<string | null>(null)
  const renderAbortRef = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => (): void => {
      renderAbortRef.current?.abort()
    },
    []
  )

  const waitForNextPoll = (signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject): void => {
      const timer = window.setTimeout(resolve, 1000)
      signal.addEventListener(
        'abort',
        (): void => {
          window.clearTimeout(timer)
          reject(new DOMException('PDF polling was aborted.', 'AbortError'))
        },
        { once: true }
      )
    })

  const renderPdf = async (): Promise<void> => {
    if (isRendering) return
    renderAbortRef.current?.abort()
    const controller = new AbortController()
    renderAbortRef.current = controller
    setRendering(true)
    setError(null)
    try {
      await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.pdf_render', scope: 'resume' },
        async (): Promise<void> => {
          let current = await gateway.startResumePdfRender({
            resumeId: editor.resume.id,
            resumeRevision: editor.resume.revision,
            signal: controller.signal
          })
          setJob(current)
          for (
            let attempt = 0;
            attempt < 60 && ['queued', 'running'].includes(current.status);
            attempt += 1
          ) {
            current = await gateway.getResumeRenderJob(current.id, controller.signal)
            setJob(current)
            if (['queued', 'running'].includes(current.status)) {
              await waitForNextPoll(controller.signal)
            }
          }
          if (current.status !== 'succeeded') {
            throw new Error('Resume PDF rendering did not complete successfully.')
          }
          const completedArtifact = current.artifacts.at(0)
          if (completedArtifact === undefined) {
            throw new Error('Resume PDF rendering completed without a PDF artifact.')
          }
          setArtifact(completedArtifact)
        }
      )
    } catch (reason: unknown) {
      void reason
      if (!controller.signal.aborted) {
        setError(t('resume.workspace.renderError', { defaultValue: 'PDF 预览生成失败，请重试。' }))
      }
    } finally {
      if (!controller.signal.aborted) setRendering(false)
    }
  }

  /**
   * @brief 请求当前宿主保存已生成的 PDF / Ask the current host to save the generated PDF.
   * @return 保存流程结束后的 Promise / Promise fulfilled after the save flow ends.
   */
  const savePdf = async (): Promise<void> => {
    if (artifact === null || isSaving) return

    setSaving(true)
    setSaveError(null)
    setSaveStatus(null)
    try {
      /** @brief 宿主返回的保存判别结果 / Discriminated save result returned by the host. */
      const result = await artifactSave.saveArtifact({
        contentUrl: artifact.contentUrl,
        suggestedFileName: sanitizePdfFileName(`${editor.resume.profile.fullName} Resume`)
      })
      if (result.status === 'saved') {
        setSaveStatus(t('resume.workspace.pdfSaved', { defaultValue: 'PDF 已保存。' }))
      } else if (result.status === 'started') {
        setSaveStatus(
          t('resume.workspace.pdfDownloadStarted', { defaultValue: 'PDF 下载已开始。' })
        )
      } else {
        setSaveStatus(t('resume.workspace.pdfSaveCancelled', { defaultValue: '已取消保存。' }))
      }
    } catch {
      setSaveError(t('resume.workspace.pdfSaveError', { defaultValue: 'PDF 保存失败，请重试。' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={t('resume.workspace.preview', { defaultValue: 'PDF 预览' })}>
      <div className="aw-inline-actions">
        <button
          className="aw-primary-button"
          disabled={isRendering}
          onClick={(): void => {
            void renderPdf()
          }}
          type="button"
        >
          {isRendering
            ? t('resume.workspace.renderingPdf', { defaultValue: '正在生成 PDF…' })
            : t('resume.workspace.renderPdf', { defaultValue: '生成 PDF 预览' })}
        </button>
        {job?.progressPercent !== null && job?.progressPercent !== undefined ? (
          <span aria-live="polite">{Math.round(job.progressPercent)}%</span>
        ) : null}
        {artifact !== null ? (
          <button
            className="aw-quiet-button"
            disabled={isSaving}
            onClick={(): void => {
              void savePdf()
            }}
            type="button"
          >
            {isSaving
              ? t('resume.workspace.savingPdf', { defaultValue: '正在保存 PDF…' })
              : t('resume.workspace.downloadPdf', { defaultValue: '下载 PDF' })}
          </button>
        ) : null}
      </div>
      {saveStatus !== null ? (
        <span aria-live="polite" className="aw-sr-only">
          {saveStatus}
        </span>
      ) : null}
      {saveError !== null ? (
        <div className="aw-inline-error" role="alert">
          {saveError}
        </div>
      ) : null}
      {error !== null ? (
        <div className="aw-inline-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="aw-editor-scroll aw-editor-preview">
        {artifact !== null ? (
          <iframe
            className="aw-paper"
            src={artifact.contentUrl}
            title={t('resume.workspace.pdfFrameTitle', { defaultValue: '简历 PDF 预览' })}
          />
        ) : (
          <article
            aria-label={t('resume.semanticPreviewAria', { defaultValue: '简历语义预览' })}
            className="aw-paper"
          >
            <header className="aw-paper-header">
              <h2 className="aw-paper-name">{editor.resume.profile.fullName}</h2>
              {editor.resume.profile.headline !== null ? (
                <p className="aw-paper-role">{editor.resume.profile.headline}</p>
              ) : null}
              <p className="aw-paper-contact">
                {editor.resume.profile.contacts.map((contact) => contact.value).join(' · ')}
              </p>
            </header>
            {editor.resume.sections
              .filter((section) => section.visible)
              .map((section) => (
                <ResumePaperSection key={section.id} section={section} />
              ))}
          </article>
        )}
      </div>
    </section>
  )
}

/** @brief 已加载的三窗口简历工作台 / Loaded three-window resume workspace. */
export function ResumeWorkspace({
  initialEditor,
  gateway,
  templates
}: {
  readonly initialEditor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly templates: readonly UiTemplateManifest[]
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const [editor, setEditor] = useState(initialEditor)
  const [visiblePanes, setVisiblePanes] = useState<Readonly<Record<ResumePane, boolean>>>({
    assistant: true,
    editor: true,
    preview: true
  })
  const [paneSizes, setPaneSizes] = useState(INITIAL_PANE_SIZES)
  const [availableTemplates, setAvailableTemplates] =
    useState<readonly UiTemplateManifest[]>(templates)
  const [conflictStatus, setConflictStatus] = useState<ResumeConflictStatus | null>(null)
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  const [authorityReloadError, setAuthorityReloadError] = useState(false)
  const [authorityReloadRevision, setAuthorityReloadRevision] = useState(0)
  const [mobilePane, setMobilePane] = useState<MobileResumePane>('preview')
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false)

  const visiblePaneOrder = useMemo(
    () => RESUME_PANES.filter((pane) => visiblePanes[pane]),
    [visiblePanes]
  )
  const selectedTemplate = availableTemplates.find(
    (template) => template.id === editor.resume.template.templateId
  )

  const handleMutationError = (error: unknown): boolean => {
    const status = getResumeConflictStatus(error)
    if (status === null) return false
    setConflictStatus(status)
    return true
  }

  const reloadAuthoritativeWorkspace = async (): Promise<void> => {
    if (isReloadingAuthority) return
    setReloadingAuthority(true)
    setAuthorityReloadError(false)
    try {
      const { nextEditor, nextTemplates } = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.authority_reload', scope: 'resume' },
        async () => {
          const nextEditor = await gateway.getResumeEditor(editor.resume.id)
          const nextTemplates = await gateway.listTemplateManifests(nextEditor.resume.locale)
          return { nextEditor, nextTemplates }
        }
      )
      setEditor(nextEditor)
      setAvailableTemplates(nextTemplates)
      setAuthorityReloadRevision((current) => current + 1)
      setConflictStatus(null)
    } catch {
      setAuthorityReloadError(true)
    } finally {
      setReloadingAuthority(false)
    }
  }

  const togglePane = (pane: ResumePane): void => {
    setVisiblePanes((current) => ({ ...current, [pane]: !current[pane] }))
  }

  const resizeAdjacentPanes = (left: ResumePane, right: ResumePane, delta: number): void => {
    setPaneSizes((current) => {
      const pairTotal = current[left] + current[right]
      const minimum = pairTotal * 0.18
      const nextLeft = Math.min(pairTotal - minimum, Math.max(minimum, current[left] + delta))
      return { ...current, [left]: nextLeft, [right]: pairTotal - nextLeft }
    })
  }

  const selectTemplate = async (templateId: string): Promise<void> => {
    if (conflictStatus !== null) return
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.template_select', scope: 'resume' },
        () =>
          gateway.selectResumeTemplate({
            resumeId: editor.resume.id,
            templateId: asUiOpaqueId<'template'>(templateId)
          })
      )
      setEditor(next)
    } catch (reason: unknown) {
      handleMutationError(reason)
    }
  }

  const panelByKey: Record<ResumePane, React.ReactNode> = {
    assistant: <ResumeAssistantPanel onCloseMobile={(): void => setMobileAssistantOpen(false)} />,
    editor: (
      <ResumeSectionsEditor
        editor={editor}
        gateway={gateway}
        isWriteLocked={conflictStatus !== null}
        key={authorityReloadRevision}
        onEditorChange={setEditor}
        onMutationError={handleMutationError}
      />
    ),
    preview: (
      <ResumePreviewPanel
        editor={editor}
        gateway={gateway}
        initialArtifact={null}
        key={authorityReloadRevision}
      />
    )
  }

  return (
    <>
      {conflictStatus === null ? null : (
        <div className="aw-inline-error aw-resume-conflict" role="alert">
          <div>
            <strong>{t('resume.workspace.conflictTitle')}</strong>
            <p>{t('resume.workspace.conflictDescription')}</p>
          </div>
          <button
            className="aw-quiet-button"
            disabled={isReloadingAuthority}
            onClick={(): void => {
              void reloadAuthoritativeWorkspace()
            }}
            type="button"
          >
            {isReloadingAuthority
              ? t('resume.workspace.reloadingAuthority')
              : t('resume.workspace.reloadAuthority')}
          </button>
          {authorityReloadError ? <span>{t('resume.workspace.reloadAuthorityError')}</span> : null}
        </div>
      )}
      <div
        aria-label={t('resume.mobileTabs', { defaultValue: '移动端面板切换' })}
        className="aw-mobile-tabs"
      >
        <button
          aria-pressed={mobilePane === 'edit'}
          className="aw-tab"
          onClick={(): void => setMobilePane('edit')}
          type="button"
        >
          {t('resume.form', { defaultValue: '内容' })}
        </button>
        <button
          aria-pressed={mobilePane === 'preview'}
          className="aw-tab"
          onClick={(): void => setMobilePane('preview')}
          type="button"
        >
          {t('resume.preview', { defaultValue: '预览' })}
        </button>
        <button className="aw-tab" onClick={(): void => setMobileAssistantOpen(true)} type="button">
          {t('resume.assistant', { defaultValue: '简历助手' })}
        </button>
      </div>
      <div
        className={`aw-editor-page aw-editor-page--mobile-${mobilePane} ${mobileAssistantOpen ? 'aw-editor-page--mobile-assistant-open' : ''}`}
      >
        <div
          aria-label={t('resume.workspace.windowControls', { defaultValue: '简历窗口控制' })}
          className="aw-resume-window-bar"
          role="toolbar"
        >
          <ResumeWindowTitle
            expanded={visiblePanes.assistant}
            label={t('resume.workspace.assistant', { defaultValue: 'AI 对话' })}
            onToggle={(): void => togglePane('assistant')}
          />
          <ResumeWindowTitle
            expanded={visiblePanes.editor}
            label={t('resume.workspace.editor', { defaultValue: '内容编辑' })}
            onToggle={(): void => togglePane('editor')}
            trailing={<span className="aw-window-meta">{editor.resume.sections.length}</span>}
          />
          <ResumeWindowTitle
            expanded={visiblePanes.preview}
            label={t('resume.workspace.preview', { defaultValue: 'PDF 预览' })}
            onToggle={(): void => togglePane('preview')}
            trailing={
              <>
                <label className="aw-template-quick-select">
                  <span className="aw-sr-only">
                    {t('resume.workspace.quickTemplate', { defaultValue: '快速切换简历模板' })}
                  </span>
                  <select
                    aria-label={t('resume.workspace.quickTemplate', {
                      defaultValue: '快速切换简历模板'
                    })}
                    disabled={conflictStatus !== null}
                    onChange={(event): void => {
                      void selectTemplate(event.target.value)
                    }}
                    value={editor.resume.template.templateId}
                  >
                    {availableTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="aw-current-template" aria-live="polite">
                  {selectedTemplate?.name ?? ''}
                </span>
                <Link
                  aria-disabled={conflictStatus !== null}
                  aria-label={t('resume.templateSettings', { defaultValue: '模板设置' })}
                  className="aw-icon-button"
                  onClick={(event): void => {
                    if (conflictStatus !== null) event.preventDefault()
                  }}
                  to={`/resumes/${editor.resume.id}/template`}
                >
                  <Settings2 aria-hidden="true" size={15} />
                </Link>
              </>
            }
          />
        </div>
        <div className="aw-resume-workspace-content">
          {visiblePaneOrder.map((pane, index) => {
            const nextPane = visiblePaneOrder[index + 1]
            const totalVisibleSize = visiblePaneOrder.reduce(
              (total, key) => total + paneSizes[key],
              0
            )
            return (
              <Fragment key={pane}>
                <div
                  className={`aw-resume-workspace-panel aw-resume-workspace-panel--${pane}`}
                  style={{ flexGrow: paneSizes[pane] }}
                >
                  {panelByKey[pane]}
                </div>
                {nextPane !== undefined ? (
                  <ResumePaneSeparator
                    leftPane={pane}
                    onResize={(delta): void => resizeAdjacentPanes(pane, nextPane, delta)}
                    value={paneSizes[pane] / Math.max(totalVisibleSize, 1)}
                  />
                ) : null}
              </Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
