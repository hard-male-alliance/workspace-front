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
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'
import { createUiCommandId, type UiCommandId } from '../../../shared-kernel/command'
import {
  getResumeConflictStatus,
  isResumeOperationRejected,
  type ResumeConflictStatus
} from '../application/errors'
import type { ResumeGateway } from '../application/gateway'
import {
  getTemplateIdentity,
  loadTemplateCatalogWithPinnedVersion
} from '../application/template-catalog'
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
  /** @brief 失败的显式字段修改 / Explicit field change that failed. */
  readonly field: 'title' | 'content'
}

/** @brief 板块结构操作的安全失败状态 / Safe failure state for a section-structure operation. */
interface ResumeStructureFailure {
  /** @brief 未向用户直接展示的技术错误 / Technical error not displayed directly to the user. */
  readonly error: unknown
  /** @brief 保留动作上下文的安全本地化标题 / Safe localized title preserving action context. */
  readonly title: string
}

/** @brief 必须先通过权威读取恢复的简历写状态 / Resume-write state requiring an authoritative read before recovery. */
type ResumeAuthorityRecovery =
  | {
      /** @brief 乐观并发冲突 / Optimistic-concurrency conflict. */
      readonly kind: 'conflict'
      /** @brief 服务端返回的稳定冲突状态 / Stable conflict status returned by the service. */
      readonly status: ResumeConflictStatus
    }
  | {
      /** @brief 服务端是否提交命令无法确认 / Whether the service committed the command cannot be determined. */
      readonly kind: 'outcome-unknown'
    }
  | {
      /** @brief 已确认批次包含拒绝操作，可能需要吸收其他操作结果 / A confirmed batch contained a rejected operation and may require reconciling other results. */
      readonly kind: 'rejected'
    }

/** @brief Resume 聚合写操作的页面级单通道执行器 / Page-level single-lane runner for Resume aggregate mutations. */
interface RunResumeMutation {
  /**
   * @brief 仅在当前没有 Resume 写入时执行意图 / Run an intent only when no Resume write is active.
   * @template TResult 写操作结果 / Mutation result.
   * @param mutation 延迟执行的写操作 / Deferred mutation.
   * @return 写结果；被当前通道拒绝时为 null / Mutation result, or null when rejected by the active lane.
   */
  <TResult>(mutation: () => Promise<TResult>): Promise<TResult | null>
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

/**
 * @brief 创建 PDF 预览绑定的简历代际身份 / Create the Resume generation identity bound to a PDF preview.
 * @param editor 当前简历编辑器 / Current Resume editor.
 * @return 包含简历、revision 与模板身份的稳定键 / Stable key containing Resume, revision, and template identity.
 */
function createResumePreviewIdentity(editor: UiResumeEditorModel): string {
  return JSON.stringify([
    editor.resume.id,
    editor.resume.revision,
    editor.resume.template.templateId,
    editor.resume.template.templateVersion
  ])
}

/**
 * @brief 核对 Render Job 是否属于当前简历 revision / Check whether a Render Job belongs to the current Resume revision.
 * @param job 待核对的 Render Job / Render Job to inspect.
 * @param editor 当前简历编辑器 / Current Resume editor.
 * @return 身份与 revision 均匹配时为 true / True when both identity and revision match.
 */
function isRenderJobCurrent(job: UiResumeRenderJob, editor: UiResumeEditorModel): boolean {
  return job.resumeId === editor.resume.id && job.resumeRevision === editor.resume.revision
}

/**
 * @brief 核对 PDF 产物是否属于当前简历 revision / Check whether a PDF artifact belongs to the current Resume revision.
 * @param artifact 待核对的 PDF 产物 / PDF artifact to inspect.
 * @param editor 当前简历编辑器 / Current Resume editor.
 * @return 身份与 revision 均匹配时为 true / True when both identity and revision match.
 */
function isPdfArtifactCurrent(artifact: UiResumePdfArtifact, editor: UiResumeEditorModel): boolean {
  return (
    artifact.resumeId === editor.resume.id && artifact.resumeRevision === editor.resume.revision
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
  onMutationError,
  runMutation
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly isWriteLocked: boolean
  readonly onEditorChange: (editor: UiResumeEditorModel) => void
  readonly onMutationError: (error: unknown) => boolean
  readonly runMutation: RunResumeMutation
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
  /** @brief 结构操作的安全失败状态 / Safe structural-operation failure state. */
  const [structureFailure, setStructureFailure] = useState<ResumeStructureFailure | null>(null)

  useEffect((): void => {
    setDrafts((current) => {
      /** @brief 仍未被最新权威投影确认的草稿 / Drafts still unconfirmed by the latest authoritative projection. */
      const remaining: Record<string, ResumeSectionDraft> = {}
      /** @brief 是否有草稿已由权威数据确认或失效 / Whether any draft was confirmed or invalidated by authority. */
      let changed = false
      for (const [sectionId, draft] of Object.entries(current)) {
        const section = editor.resume.sections.find((item) => item.id === sectionId)
        if (
          section !== undefined &&
          (draft.title !== section.title || draft.content !== getSectionContent(section))
        ) {
          remaining[sectionId] = draft
        } else {
          changed = true
        }
      }
      return changed ? remaining : current
    })
  }, [editor])

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

  const persistSection = async (
    section: UiResumeSection,
    field: 'title' | 'content'
  ): Promise<void> => {
    /** @brief 本次需要提交的草稿快照 / Draft snapshot to submit in this attempt. */
    const draft = drafts[section.id]
    if (draft === undefined || savingSectionId !== null || isWriteLocked) return
    /** @brief 当前权威字段值 / Current authoritative value for the selected field. */
    const authoritativeValue = field === 'title' ? section.title : getSectionContent(section)
    if (draft[field] === authoritativeValue) return
    setSavingSectionId(section.id)
    setSaveFailure(null)
    try {
      const next = await runMutation(() =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_update', scope: 'resume' },
          () =>
            gateway.updateResumeSection({
              baseRevision: editor.resume.revision,
              resumeId: editor.resume.id,
              sectionId: section.id,
              [field]: draft[field]
            })
        )
      )
      if (next === null) return
      onEditorChange(next)
      setStructureFailure(null)
      setDrafts((current) => {
        /** @brief 回包成功响应中的权威板块 / Authoritative section returned in the successful response. */
        const confirmedSection = next.resume.sections.find((item) => item.id === section.id)
        /** @brief 响应到达时的最新本地草稿 / Latest local draft when the response arrives. */
        const currentDraft = current[section.id]
        if (confirmedSection === undefined || currentDraft === undefined) return current
        /** @brief 仅吸收本次已确认字段的草稿 / Draft with only the confirmed field absorbed. */
        const reconciled: ResumeSectionDraft = {
          ...currentDraft,
          [field]: field === 'title' ? confirmedSection.title : getSectionContent(confirmedSection)
        }
        if (
          reconciled.title !== confirmedSection.title ||
          reconciled.content !== getSectionContent(confirmedSection)
        ) {
          return { ...current, [section.id]: reconciled }
        }
        /** @brief 全部获确认后保留的其他草稿 / Other drafts retained after every field is confirmed. */
        const { [section.id]: _confirmed, ...remaining } = current
        void _confirmed
        return remaining
      })
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setSaveFailure({ error: reason, field, sectionId: section.id })
    } finally {
      setSavingSectionId(null)
    }
  }

  const reorder = async (orderedIds: readonly UiResumeSectionId[]): Promise<void> => {
    if (isWriteLocked) return
    try {
      const next = await runMutation(() =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_reorder', scope: 'resume' },
          () =>
            gateway.reorderResumeSections({
              baseRevision: editor.resume.revision,
              resumeId: editor.resume.id,
              orderedSectionIds: orderedIds
            })
        )
      )
      if (next === null) return
      onEditorChange(next)
      setStructureFailure(null)
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setStructureFailure({
        error: reason,
        title: t('resume.workspace.reorderError', { defaultValue: '无法调整板块顺序。' })
      })
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
      const next = await runMutation(() =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_delete', scope: 'resume' },
          () =>
            gateway.deleteResumeSection({
              baseRevision: editor.resume.revision,
              resumeId: editor.resume.id,
              sectionId
            })
        )
      )
      if (next === null) return
      onEditorChange(next)
      setStructureFailure(null)
      setFocusedSectionId(next.resume.sections.at(0)?.id ?? null)
      setDeleteCandidate(null)
    } catch (reason: unknown) {
      if (onMutationError(reason)) return
      setStructureFailure({
        error: reason,
        title: t('resume.workspace.deleteError', { defaultValue: '无法删除这个板块。' })
      })
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
      {structureFailure !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>{structureFailure.title}</strong>{' '}
          <ResourceFailureMessage error={structureFailure.error} />
        </div>
      ) : null}
      {saveFailure !== null ? (
        <ResourceErrorState
          error={saveFailure.error}
          onRetry={(): void => {
            /** @brief 仍存在于权威投影中的失败板块 / Failed section still present in the authoritative projection. */
            const section = editor.resume.sections.find((item) => item.id === saveFailure.sectionId)
            if (section !== undefined) void persistSection(section, saveFailure.field)
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
                        if (current !== undefined) void persistSection(current, 'title')
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
                          if (current !== undefined) void persistSection(current, 'content')
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
  generation,
  gateway,
  isWriteLocked,
  onAuthorityConflict,
  pdfSupported
}: {
  readonly editor: UiResumeEditorModel
  readonly generation: string
  readonly gateway: ResumeGateway
  /** @brief 文档权威状态未恢复时禁止创建新 Job / Prevent new Job creation until document authority is recovered. */
  readonly isWriteLocked: boolean
  /** @brief 将并发冲突提升到 Resume 聚合恢复状态 / Promote a concurrency conflict to Resume aggregate recovery. */
  readonly onAuthorityConflict: (status: ResumeConflictStatus) => void
  readonly pdfSupported: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const artifactSave = useArtifactSave()
  const [artifact, setArtifact] = useState<UiResumePdfArtifact | null>(null)
  const [job, setJob] = useState<UiResumeRenderJob | null>(null)
  /** @brief 最近一次 Render Job 启动或轮询错误 / Latest Render Job start or polling error. */
  const [error, setError] = useState<unknown>(null)
  const [isRendering, setRendering] = useState(false)
  /** @brief 启动响应得到确认前必须复用的命令身份 / Command identity that must be reused until the start response is confirmed. */
  const [startCommandId, setStartCommandId] = useState<UiCommandId | null>(null)
  /** @brief PDF 产物是否正在由宿主保存 / Whether the PDF artifact is being saved by the host. */
  const [isSaving, setSaving] = useState(false)
  /** @brief 产物保存的可访问状态 / Accessible artifact-save status. */
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  /** @brief 产物保存失败 / Artifact-save failure. */
  const [saveError, setSaveError] = useState<unknown>(null)
  const renderAbortRef = useRef<AbortController | null>(null)
  /** @brief 当前仍允许提交异步结果的预览代际 / Preview generation still allowed to commit async results. */
  const activeGenerationRef = useRef<string | null>(generation)
  /** @brief Render 失败的安全页面语义 / Safe page semantics of the Render failure. */
  const renderFailure = error === null ? null : classifyResourceFailure(error)
  /** @brief 是否可继续查询已经获得身份的 Job / Whether a Job whose identity is known can be polled again. */
  const canResumePolling =
    error !== null && job !== null && ['queued', 'running'].includes(job.status)
  /** @brief 是否必须用同一幂等键确认 Job 创建结果 / Whether Job creation must be confirmed with the same idempotency key. */
  const mustConfirmStart = renderFailure?.kind === 'outcome-unknown' && startCommandId !== null
  /** @brief 产物保存结果是否无法确认 / Whether the artifact-save outcome cannot be confirmed. */
  const saveOutcomeUnknown =
    saveError !== null && classifyResourceFailure(saveError).kind === 'outcome-unknown'

  useEffect((): (() => void) => {
    activeGenerationRef.current = generation
    return (): void => {
      if (activeGenerationRef.current === generation) activeGenerationRef.current = null
      renderAbortRef.current?.abort()
    }
  }, [generation])

  /**
   * @brief 判断异步操作是否仍可提交到当前预览代际 / Test whether an async operation may still commit to the current preview generation.
   * @param expectedGeneration 操作启动时的代际 / Generation captured when the operation started.
   * @param signal 可选取消信号 / Optional abort signal.
   * @return 组件仍挂载、代际未变化且未取消时为 true / True while mounted, current, and not aborted.
   */
  const canCommitGeneration = (expectedGeneration: string, signal?: AbortSignal): boolean =>
    activeGenerationRef.current === expectedGeneration && signal?.aborted !== true

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
    if (isRendering || isWriteLocked || !pdfSupported) return
    renderAbortRef.current?.abort()
    const controller = new AbortController()
    /** @brief 本次渲染绑定的预览代际 / Preview generation captured for this render. */
    const expectedGeneration = generation
    renderAbortRef.current = controller
    setRendering(true)
    setError(null)
    /** @brief 本次是继续读取已知 Job，而不是创建另一个 Job / This attempt resumes a known Job instead of creating another Job. */
    const resumeKnownJob = canResumePolling
    /** @brief 一次用户生成意图内稳定的 command identity / Stable command identity within one user render intent. */
    const commandId = startCommandId ?? createUiCommandId()
    if (!resumeKnownJob && startCommandId === null) setStartCommandId(commandId)
    try {
      await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.pdf_render', scope: 'resume' },
        async (): Promise<void> => {
          let current =
            resumeKnownJob && job !== null
              ? job
              : await gateway.startResumePdfRender({
                  commandId,
                  resumeId: editor.resume.id,
                  resumeRevision: editor.resume.revision,
                  signal: controller.signal
                })
          if (!canCommitGeneration(expectedGeneration, controller.signal)) return
          if (!resumeKnownJob) setStartCommandId(null)
          if (!isRenderJobCurrent(current, editor)) {
            throw new Error('Resume PDF Render Job belongs to a different Resume generation.')
          }
          setJob(current)
          for (
            let attempt = 0;
            attempt < 60 && ['queued', 'running'].includes(current.status);
            attempt += 1
          ) {
            current = await gateway.getResumeRenderJob(current.id, controller.signal)
            if (!canCommitGeneration(expectedGeneration, controller.signal)) return
            if (!isRenderJobCurrent(current, editor)) {
              throw new Error('Resume PDF Render Job belongs to a different Resume generation.')
            }
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
          if (!isPdfArtifactCurrent(completedArtifact, editor)) {
            throw new Error('Resume PDF artifact belongs to a different Resume generation.')
          }
          if (!canCommitGeneration(expectedGeneration, controller.signal)) return
          setArtifact(completedArtifact)
        }
      )
    } catch (reason: unknown) {
      if (canCommitGeneration(expectedGeneration, controller.signal)) {
        /** @brief PDF 生成返回的权威并发冲突 / Authoritative concurrency conflict returned by PDF generation. */
        const conflictStatus = getResumeConflictStatus(reason)
        if (conflictStatus !== null) {
          setStartCommandId(null)
          onAuthorityConflict(conflictStatus)
          return
        }
        setError(reason)
        if (classifyResourceFailure(reason).kind !== 'outcome-unknown') {
          setStartCommandId(null)
        }
      }
    } finally {
      if (canCommitGeneration(expectedGeneration, controller.signal)) {
        if (renderAbortRef.current === controller) renderAbortRef.current = null
        setRendering(false)
      }
    }
  }

  /**
   * @brief 请求当前宿主保存已生成的 PDF / Ask the current host to save the generated PDF.
   * @return 保存流程结束后的 Promise / Promise fulfilled after the save flow ends.
   */
  const savePdf = async (): Promise<void> => {
    if (artifact === null || isSaving || !isPdfArtifactCurrent(artifact, editor)) return

    /** @brief 本次保存绑定的预览代际 / Preview generation captured for this save. */
    const expectedGeneration = generation
    /** @brief 本次保存使用的不可变产物快照 / Immutable artifact snapshot used by this save. */
    const artifactToSave = artifact
    setSaving(true)
    setSaveError(null)
    setSaveStatus(null)
    try {
      /** @brief 宿主返回的保存判别结果 / Discriminated save result returned by the host. */
      const result = await artifactSave.saveArtifact({
        artifactId: artifactToSave.id,
        suggestedFileName: sanitizePdfFileName(`${editor.resume.profile.fullName} Resume`)
      })
      if (!canCommitGeneration(expectedGeneration)) return
      if (result.status === 'saved') {
        setSaveStatus(t('resume.workspace.pdfSaved', { defaultValue: 'PDF 已保存。' }))
      } else if (result.status === 'started') {
        setSaveStatus(
          t('resume.workspace.pdfDownloadStarted', { defaultValue: 'PDF 下载已开始。' })
        )
      } else {
        setSaveStatus(t('resume.workspace.pdfSaveCancelled', { defaultValue: '已取消保存。' }))
      }
    } catch (error: unknown) {
      if (canCommitGeneration(expectedGeneration)) {
        setSaveError(error)
      }
    } finally {
      if (canCommitGeneration(expectedGeneration)) setSaving(false)
    }
  }

  return (
    <section
      aria-label={
        artifact === null
          ? t('resume.workspace.semanticPreviewRegion', {
              defaultValue: '语义内容预览（非最终排版）'
            })
          : t('resume.workspace.pdfPreviewRegion', { defaultValue: 'PDF 预览' })
      }
    >
      <div className="aw-inline-actions">
        <button
          className="aw-primary-button"
          disabled={isRendering || isWriteLocked || !pdfSupported}
          onClick={(): void => {
            void renderPdf()
          }}
          type="button"
        >
          {isRendering
            ? t('resume.workspace.renderingPdf', { defaultValue: '正在生成 PDF…' })
            : mustConfirmStart
              ? t('resume.workspace.confirmPdfRender', {
                  defaultValue: '确认 PDF 生成结果'
                })
              : canResumePolling
                ? t('resume.workspace.resumePdfPolling', {
                    defaultValue: '继续查询 PDF'
                  })
                : t('resume.workspace.renderPdf', { defaultValue: '生成 PDF 预览' })}
        </button>
        {!pdfSupported ? (
          <span className="aw-muted-copy">
            {t('resume.workspace.pdfUnsupported', {
              defaultValue: '当前模板不支持 PDF 输出。'
            })}
          </span>
        ) : null}
        {artifact === null ? (
          <span className="aw-muted-copy">
            {t('resume.workspace.semanticPreviewNotice', {
              defaultValue: '当前为语义内容预览，不代表最终模板排版。'
            })}
          </span>
        ) : null}
        {job?.progressPercent !== null && job?.progressPercent !== undefined ? (
          <span aria-live="polite">{Math.round(job.progressPercent)}%</span>
        ) : null}
        {artifact !== null ? (
          <button
            className="aw-quiet-button"
            disabled={isSaving || saveOutcomeUnknown}
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
          <strong>
            {saveOutcomeUnknown
              ? t('resume.workspace.pdfSaveOutcomeUnknown', {
                  defaultValue: 'PDF 保存结果待确认。请先检查下载记录或目标文件。'
                })
              : t('resume.workspace.pdfSaveError', { defaultValue: '无法保存 PDF' })}
          </strong>{' '}
          <ResourceFailureMessage error={saveError} />
        </div>
      ) : null}
      {error !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {mustConfirmStart
              ? t('resume.workspace.renderOutcomeUnknown', {
                  defaultValue: 'PDF 生成结果待确认。'
                })
              : t('resume.workspace.renderError', { defaultValue: '无法生成 PDF 预览' })}
          </strong>{' '}
          <ResourceFailureMessage error={error} />
        </div>
      ) : null}
      <div className="aw-editor-scroll aw-editor-preview">
        {artifact !== null ? (
          <iframe
            className="aw-paper"
            sandbox=""
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
  /** @brief 阻止未知或陈旧写入继续扩散的权威恢复状态 / Authority-recovery state preventing unknown or stale writes from spreading. */
  const [authorityRecovery, setAuthorityRecovery] = useState<ResumeAuthorityRecovery | null>(null)
  /** @brief React 提交期间向全部 Resume 写控件广播的执行状态 / In-flight state broadcast to every Resume write control during React commits. */
  const [isMutatingResume, setMutatingResume] = useState(false)
  /** @brief 在同一事件循环内也能原子拒绝第二个写意图 / Atomic guard rejecting a second write intent within the same event loop. */
  const mutationInFlightRef = useRef(false)
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  /** @brief 权威简历重新读取错误 / Authoritative Resume reload error. */
  const [authorityReloadError, setAuthorityReloadError] = useState<unknown>(null)
  const [authorityReloadRevision, setAuthorityReloadRevision] = useState(0)
  /** @brief 仅在并发冲突后重置本地编辑草稿的序号 / Sequence that resets local editor drafts only after a concurrency conflict. */
  const [editorResetRevision, setEditorResetRevision] = useState(0)
  const [mobilePane, setMobilePane] = useState<MobileResumePane>('preview')
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false)

  const visiblePaneOrder = useMemo(
    () => RESUME_PANES.filter((pane) => visiblePanes[pane]),
    [visiblePanes]
  )
  const selectedTemplate = availableTemplates.find(
    (template) =>
      template.id === editor.resume.template.templateId &&
      template.version === editor.resume.template.templateVersion
  )
  /** @brief 当前 PDF 预览的完整代际键 / Complete generation key for the current PDF preview. */
  const previewGeneration = `${authorityReloadRevision}:${createResumePreviewIdentity(editor)}`
  /** @brief 是否必须完成权威读取后才能继续修改简历 / Whether an authoritative read is required before further Resume writes. */
  const isWriteLocked = authorityRecovery !== null || isMutatingResume

  /**
   * @brief 在页面唯一 Resume mutation lane 中执行用户意图 / Run a user intent in the page's sole Resume mutation lane.
   * @template TResult 写操作结果 / Mutation result.
   * @param mutation 延迟执行的 gateway 写操作 / Deferred gateway mutation.
   * @return 写结果；已有写操作执行中时为 null / Mutation result, or null while another write is active.
   */
  const runResumeMutation: RunResumeMutation = async <TResult,>(
    mutation: () => Promise<TResult>
  ): Promise<TResult | null> => {
    if (mutationInFlightRef.current || authorityRecovery !== null) return null
    mutationInFlightRef.current = true
    setMutatingResume(true)
    try {
      return await mutation()
    } finally {
      mutationInFlightRef.current = false
      setMutatingResume(false)
    }
  }

  const handleMutationError = (error: unknown): boolean => {
    const status = getResumeConflictStatus(error)
    if (status !== null) {
      setAuthorityRecovery({ kind: 'conflict', status })
      return true
    }
    if (classifyResourceFailure(error).kind === 'outcome-unknown') {
      setAuthorityRecovery({ kind: 'outcome-unknown' })
      return true
    }
    if (isResumeOperationRejected(error)) {
      setAuthorityRecovery({ kind: 'rejected' })
      return true
    }
    return false
  }

  const reloadAuthoritativeWorkspace = async (): Promise<void> => {
    if (isReloadingAuthority) return
    /** @brief 发起读取时需要恢复的写失败类别 / Write-failure category being recovered by this read. */
    const recoveryKind = authorityRecovery?.kind
    setReloadingAuthority(true)
    setAuthorityReloadError(null)
    try {
      const { nextEditor, nextTemplates } = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.authority_reload', scope: 'resume' },
        async () => {
          const nextEditor = await gateway.getResumeEditor(editor.resume.id)
          const nextTemplates = await loadTemplateCatalogWithPinnedVersion(
            gateway,
            nextEditor.resume.locale,
            nextEditor.resume.template
          )
          return { nextEditor, nextTemplates }
        }
      )
      setEditor(nextEditor)
      setAvailableTemplates(nextTemplates)
      setAuthorityReloadRevision((current) => current + 1)
      if (recoveryKind === 'conflict') {
        setEditorResetRevision((current) => current + 1)
      }
      setAuthorityRecovery(null)
    } catch (error: unknown) {
      setAuthorityReloadError(error)
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

  const panelByKey: Record<ResumePane, React.ReactNode> = {
    assistant: <ResumeAssistantPanel onCloseMobile={(): void => setMobileAssistantOpen(false)} />,
    editor: (
      <ResumeSectionsEditor
        editor={editor}
        gateway={gateway}
        isWriteLocked={isWriteLocked}
        key={editorResetRevision}
        onEditorChange={setEditor}
        onMutationError={handleMutationError}
        runMutation={runResumeMutation}
      />
    ),
    preview: (
      <ResumePreviewPanel
        editor={editor}
        generation={previewGeneration}
        gateway={gateway}
        isWriteLocked={isWriteLocked}
        key={previewGeneration}
        onAuthorityConflict={(status): void => {
          setAuthorityRecovery({ kind: 'conflict', status })
        }}
        pdfSupported={selectedTemplate?.supportedOutputFormats.includes('pdf') === true}
      />
    )
  }

  return (
    <>
      {authorityRecovery === null ? null : (
        <div className="aw-inline-error aw-resume-conflict" role="alert">
          <div>
            <strong>
              {authorityRecovery.kind === 'conflict'
                ? t('resume.workspace.conflictTitle')
                : authorityRecovery.kind === 'rejected'
                  ? t('resume.workspace.operationRejectedTitle')
                  : t('resume.workspace.outcomeUnknownTitle')}
            </strong>
            <p>
              {authorityRecovery.kind === 'conflict'
                ? t('resume.workspace.conflictDescription')
                : authorityRecovery.kind === 'rejected'
                  ? t('resume.workspace.operationRejectedDescription')
                  : t('resume.workspace.outcomeUnknownDescription')}
            </p>
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
          {authorityReloadError !== null ? (
            <span>
              <strong>{t('resume.workspace.reloadAuthorityError')}</strong>{' '}
              <ResourceFailureMessage error={authorityReloadError} />
            </span>
          ) : null}
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
            label={t('resume.workspace.previewWindow', { defaultValue: '预览' })}
            onToggle={(): void => togglePane('preview')}
            trailing={
              <>
                <label className="aw-template-quick-select">
                  <span className="aw-sr-only">
                    {t('resume.workspace.quickTemplate', { defaultValue: '快速切换简历模板' })}
                  </span>
                  <select
                    aria-describedby="resume-template-migration-unavailable"
                    aria-label={t('resume.workspace.quickTemplate', {
                      defaultValue: '快速切换简历模板'
                    })}
                    disabled
                    title={t('resume.workspace.templateMigrationUnavailable', {
                      defaultValue: '模板切换暂不可用；你仍可调整当前模板的版式设置。'
                    })}
                    value={getTemplateIdentity(editor.resume.template)}
                  >
                    {availableTemplates.map((template) => (
                      <option
                        key={getTemplateIdentity(template)}
                        value={getTemplateIdentity(template)}
                      >
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <span className="aw-muted-copy" id="resume-template-migration-unavailable">
                    {t('resume.workspace.templateMigrationUnavailable', {
                      defaultValue: '模板切换暂不可用；你仍可调整当前模板的版式设置。'
                    })}
                  </span>
                </label>
                <span className="aw-current-template" aria-live="polite">
                  {selectedTemplate?.name ?? ''}
                </span>
                <Link
                  aria-disabled={isWriteLocked}
                  aria-label={t('resume.templateSettings', { defaultValue: '模板设置' })}
                  className="aw-icon-button"
                  onClick={(event): void => {
                    if (isWriteLocked) event.preventDefault()
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
          {RESUME_PANES.map((pane) => {
            /** @brief 当前窗口在可见窗口序列中的位置 / Current pane position in the visible-pane sequence. */
            const visibleIndex = visiblePaneOrder.indexOf(pane)
            /** @brief 当前窗口右侧相邻的可见窗口 / Next visible pane to the right of the current pane. */
            const nextPane = visibleIndex < 0 ? undefined : visiblePaneOrder[visibleIndex + 1]
            const totalVisibleSize = visiblePaneOrder.reduce(
              (total, key) => total + paneSizes[key],
              0
            )
            return (
              <Fragment key={pane}>
                <div
                  className={`aw-resume-workspace-panel aw-resume-workspace-panel--${pane}`}
                  hidden={!visiblePanes[pane]}
                  style={{ flexGrow: paneSizes[pane] }}
                >
                  {panelByKey[pane]}
                </div>
                {visiblePanes[pane] && nextPane !== undefined ? (
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
