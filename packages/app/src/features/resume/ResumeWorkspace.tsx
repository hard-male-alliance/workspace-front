import {
  ArrowDown,
  ArrowUp,
  Bot,
  Bold,
  ChevronDown,
  ChevronUp,
  GripVertical,
  List,
  Quote,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { runDiagnosticCommand, useDiagnostics } from '../../app/Diagnostics'
import type { ResumeGateway } from '../../domain'
import { asUiOpaqueId } from '../../domain'
import type {
  UiResumeEditorModel,
  UiResumePdfArtifact,
  UiResumeProposal,
  UiResumeRenderJob,
  UiResumeSection,
  UiResumeSectionId,
  UiTemplateManifest
} from '../../domain'
import { HttpProblemError } from '../../infrastructure/http/http-client'

/** @brief 桌面简历工作台窗口 / Desktop resume-workspace pane. */
type ResumePane = 'assistant' | 'editor' | 'preview'

/** @brief 紧凑布局当前窗口 / Current pane in compact layouts. */
type MobileResumePane = 'edit' | 'preview'

/** @brief 窗口顺序 / Stable pane order. */
const RESUME_PANES: readonly ResumePane[] = ['assistant', 'editor', 'preview']

/** @brief 初始等宽权重 / Initial equal pane weights. */
const INITIAL_PANE_SIZES: Readonly<Record<ResumePane, number>> = {
  assistant: 1,
  editor: 1,
  preview: 1
}

type ResumeConflictStatus = 409 | 412

function getResumeConflictStatus(error: unknown): ResumeConflictStatus | null {
  if (error instanceof HttpProblemError && (error.status === 409 || error.status === 412)) {
    return error.status
  }
  return null
}

/** @brief 获取板块可编辑纯文本 / Get editable plain text for a section. */
function getSectionContent(section: UiResumeSection): string {
  return section.contentPreview ?? section.items.flatMap((item) => item.highlights).join('\n')
}

/** @brief 应用本地富文本命令 / Apply a local rich-text command. */
function applyLocalRichTextCommand(command: 'bold' | 'formatBlock' | 'insertUnorderedList'): void {
  if (command === 'formatBlock') {
    document.execCommand(command, false, 'blockquote')
    return
  }
  document.execCommand(command)
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
  editor,
  gateway,
  isWriteLocked,
  onCloseMobile,
  onEditorChange,
  onMutationError,
  onProposalsChange,
  proposals
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly isWriteLocked: boolean
  readonly onCloseMobile: () => void
  readonly onEditorChange: (editor: UiResumeEditorModel) => void
  readonly onMutationError: (error: unknown) => boolean
  readonly onProposalsChange: (proposals: readonly UiResumeProposal[]) => void
  readonly proposals: readonly UiResumeProposal[]
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const [draft, setDraft] = useState('')
  const [isSending, setSending] = useState(false)
  const [decidingProposalId, setDecidingProposalId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submitMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const message = draft.trim()
    if (message.length === 0 || isSending || isWriteLocked) {
      return
    }
    setSending(true)
    setError(null)
    try {
      const proposal = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.proposal_create', scope: 'resume' },
        () =>
          gateway.createResumeProposal({
            resumeId: editor.resume.id,
            message
          })
      )
      onProposalsChange([...proposals, proposal])
      setDraft('')
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setError(
        t('resume.workspace.assistantError', {
          defaultValue: '暂时无法生成修改建议，请重试。'
        })
      )
    } finally {
      setSending(false)
    }
  }

  const decideProposal = async (
    proposal: UiResumeProposal,
    decision: 'accept' | 'reject'
  ): Promise<void> => {
    if (decidingProposalId !== null || isWriteLocked) return
    setDecidingProposalId(proposal.id)
    setError(null)
    try {
      const nextEditor = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.proposal_decide', scope: 'resume' },
        async (): Promise<UiResumeEditorModel | null> => {
          await gateway.decideResumeProposal({
            decision,
            proposalId: proposal.id
          })
          return decision === 'accept' ? gateway.getResumeEditor(editor.resume.id) : null
        }
      )
      if (nextEditor !== null) onEditorChange(nextEditor)
      onProposalsChange(proposals.filter((item) => item.id !== proposal.id))
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setError(
        t('resume.workspace.proposalDecisionError', {
          defaultValue: '建议状态已经变化，请刷新后重试。'
        })
      )
    } finally {
      setDecidingProposalId(null)
    }
  }

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
          {t('resume.workspace.proposalContext', {
            defaultValue: '建议在你明确接受前不会写入简历。'
          })}
        </p>
        {editor.assistantMessages.map((message) => (
          <div className={`aw-message aw-message--${message.role}`} key={message.id}>
            <p>{message.text}</p>
          </div>
        ))}
        {proposals.map((proposal) => (
          <article className="aw-proposal" key={proposal.id}>
            <h3 className="aw-proposal-title">{proposal.title}</h3>
            <p className="aw-proposal-reason">
              {proposal.summary ??
                t('resume.workspace.proposalSummary', {
                  defaultValue: '后端返回了结构化变更，请确认是否应用。'
                })}
            </p>
            <p>
              {t('resume.workspace.proposalRevision', {
                defaultValue: '基于简历版本 {{revision}}',
                revision: proposal.baseRevision
              })}
            </p>
            <div className="aw-inline-actions">
              <button
                className="aw-primary-button"
                disabled={decidingProposalId !== null || isWriteLocked}
                onClick={(): void => {
                  void decideProposal(proposal, 'accept')
                }}
                type="button"
              >
                {t('resume.workspace.acceptProposal', { defaultValue: '接受建议' })}
              </button>
              <button
                className="aw-quiet-button"
                disabled={decidingProposalId !== null || isWriteLocked}
                onClick={(): void => {
                  void decideProposal(proposal, 'reject')
                }}
                type="button"
              >
                {t('resume.workspace.rejectProposal', { defaultValue: '拒绝建议' })}
              </button>
            </div>
          </article>
        ))}
        {error !== null ? (
          <div className="aw-inline-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <form
        aria-label={t('resume.assistantMessageForm', { defaultValue: '简历助手消息' })}
        className="aw-chat-composer"
        onSubmit={(event): void => {
          void submitMessage(event)
        }}
      >
        <textarea
          aria-label={t('resume.workspace.askAssistantLabel', { defaultValue: '询问简历助手' })}
          className="aw-textarea"
          disabled={isSending || isWriteLocked}
          onChange={(event): void => setDraft(event.target.value)}
          placeholder={t('resume.askAssistant', {
            defaultValue: '描述你想生成或修改的简历内容…'
          })}
          value={draft}
        />
        <button
          aria-label={t('resume.sendMessage', { defaultValue: '发送消息' })}
          className="aw-icon-button aw-send-button"
          disabled={draft.trim().length === 0 || isSending || isWriteLocked}
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
  onMutationError,
  onUserMutation
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly isWriteLocked: boolean
  readonly onEditorChange: (editor: UiResumeEditorModel) => void
  readonly onMutationError: (error: unknown) => boolean
  readonly onUserMutation: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const [focusedSectionId, setFocusedSectionId] = useState<UiResumeSectionId | null>(
    editor.resume.sections.at(0)?.id ?? null
  )
  const [deleteCandidate, setDeleteCandidate] = useState<UiResumeSectionId | null>(null)
  const [draggedSectionId, setDraggedSectionId] = useState<UiResumeSectionId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const updateLocalSection = (
    sectionId: UiResumeSectionId,
    field: 'title' | 'content',
    value: string
  ) => {
    if (isWriteLocked) return
    const sections = editor.resume.sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            ...(field === 'title' ? { title: value } : { contentPreview: value })
          }
        : section
    )
    onEditorChange({ ...editor, resume: { ...editor.resume, sections } })
    onUserMutation()
  }

  const persistSection = async (section: UiResumeSection): Promise<void> => {
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_update', scope: 'resume' },
        () =>
          gateway.updateResumeSection({
            resumeId: editor.resume.id,
            sectionId: section.id,
            title: section.title,
            content: getSectionContent(section)
          })
      )
      onEditorChange(next)
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setError(
        t('resume.workspace.sectionError', { defaultValue: '板块修改未能保存到 Mock 状态。' })
      )
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
      onUserMutation()
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setError(t('resume.workspace.reorderError', { defaultValue: '无法调整板块顺序。' }))
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
      onUserMutation()
      setFocusedSectionId(next.resume.sections.at(0)?.id ?? null)
      setDeleteCandidate(null)
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setError(t('resume.workspace.deleteError', { defaultValue: '无法删除这个板块。' }))
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
      {error !== null ? (
        <div className="aw-inline-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="aw-resume-sections">
        {editor.resume.sections.map((section, index) => {
          const isFocused = section.id === focusedSectionId
          const sectionContent = getSectionContent(section)
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
                  <h3>{section.title || section.kind}</h3>
                  <span>{section.kind}</span>
                </div>
                <div className="aw-section-actions">
                  <button
                    aria-label={t('resume.workspace.moveUp', {
                      defaultValue: '上移{{name}}',
                      name: section.title
                    })}
                    className="aw-icon-button"
                    disabled={index === 0 || isWriteLocked}
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
                      name: section.title
                    })}
                    className="aw-icon-button"
                    disabled={index === editor.resume.sections.length - 1 || isWriteLocked}
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
                      name: section.title
                    })}
                    className={`aw-icon-button ${deleteCandidate === section.id ? 'aw-danger-button' : ''}`}
                    disabled={isWriteLocked}
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
                      disabled={isWriteLocked}
                      onBlur={(): void => {
                        const current = editor.resume.sections.find(
                          (item) => item.id === section.id
                        )
                        if (current !== undefined) void persistSection(current)
                      }}
                      onChange={(event): void =>
                        updateLocalSection(section.id, 'title', event.target.value)
                      }
                      value={section.title}
                    />
                  </label>
                  <label>
                    <span>{t('resume.editor.semanticContent', { defaultValue: '语义内容' })}</span>
                    <div className="aw-rich-text-shell">
                      <div
                        aria-label={t('resume.editor.formatting', {
                          defaultValue: '富文本格式工具'
                        })}
                        className="aw-rich-text-toolbar"
                        role="toolbar"
                      >
                        <button
                          className="aw-icon-button"
                          disabled={isWriteLocked}
                          onClick={(): void => applyLocalRichTextCommand('bold')}
                          type="button"
                        >
                          <Bold aria-hidden="true" size={14} />
                        </button>
                        <button
                          className="aw-icon-button"
                          disabled={isWriteLocked}
                          onClick={(): void => applyLocalRichTextCommand('formatBlock')}
                          type="button"
                        >
                          <Quote aria-hidden="true" size={14} />
                        </button>
                        <button
                          className="aw-icon-button"
                          disabled={isWriteLocked}
                          onClick={(): void => applyLocalRichTextCommand('insertUnorderedList')}
                          type="button"
                        >
                          <List aria-hidden="true" size={14} />
                        </button>
                      </div>
                      <textarea
                        aria-label={t('resume.editor.semanticContent', {
                          defaultValue: '语义内容'
                        })}
                        className="aw-section-textarea"
                        disabled={isWriteLocked}
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
  const [artifact, setArtifact] = useState<UiResumePdfArtifact | null>(initialArtifact)
  const [job, setJob] = useState<UiResumeRenderJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setRendering] = useState(false)
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
      if (!controller.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason.message
            : t('resume.workspace.renderError', { defaultValue: 'PDF 预览生成失败。' })
        )
      }
    } finally {
      if (!controller.signal.aborted) setRendering(false)
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
          <a className="aw-quiet-button" download href={artifact.contentUrl}>
            {t('resume.workspace.downloadPdf', { defaultValue: '下载 PDF' })}
          </a>
        ) : null}
      </div>
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
  initialPdfArtifact,
  initialProposals,
  gateway,
  templates
}: {
  readonly initialEditor: UiResumeEditorModel
  readonly initialPdfArtifact: UiResumePdfArtifact | null
  readonly initialProposals: readonly UiResumeProposal[]
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
  const [proposals, setProposals] = useState<readonly UiResumeProposal[]>(initialProposals)
  const [availableTemplates, setAvailableTemplates] =
    useState<readonly UiTemplateManifest[]>(templates)
  const [pdfArtifact, setPdfArtifact] = useState<UiResumePdfArtifact | null>(initialPdfArtifact)
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
      const { artifacts, nextEditor, nextProposals, nextTemplates } = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.authority_reload', scope: 'resume' },
        async () => {
          const [nextEditor, nextProposals, artifacts] = await Promise.all([
            gateway.getResumeEditor(editor.resume.id),
            gateway.listResumeProposals(editor.resume.id),
            gateway.listResumePdfArtifacts(editor.resume.id)
          ])
          const nextTemplates = await gateway.listTemplateManifests(nextEditor.resume.locale)
          return { artifacts, nextEditor, nextProposals, nextTemplates }
        }
      )
      const nextArtifact =
        [...artifacts].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
        null
      setEditor(nextEditor)
      setProposals(nextProposals)
      setAvailableTemplates(nextTemplates)
      setPdfArtifact(nextArtifact)
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
    assistant: (
      <ResumeAssistantPanel
        editor={editor}
        gateway={gateway}
        isWriteLocked={conflictStatus !== null}
        onCloseMobile={(): void => setMobileAssistantOpen(false)}
        onEditorChange={setEditor}
        onMutationError={handleMutationError}
        onProposalsChange={setProposals}
        proposals={proposals}
      />
    ),
    editor: (
      <ResumeSectionsEditor
        editor={editor}
        gateway={gateway}
        isWriteLocked={conflictStatus !== null}
        onEditorChange={setEditor}
        onMutationError={handleMutationError}
        onUserMutation={(): void => undefined}
      />
    ),
    preview: (
      <ResumePreviewPanel
        editor={editor}
        gateway={gateway}
        initialArtifact={pdfArtifact}
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
