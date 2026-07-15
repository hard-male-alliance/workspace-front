import {
  Bot,
  Bold,
  Check,
  ChevronRight,
  FileText,
  List,
  PanelRightOpen,
  Quote,
  Send,
  Settings2,
  Sparkles,
  WandSparkles,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAppGateways, useAsyncResource } from '../../app/AppData'
import { asUiOpaqueId } from '../../domain'
import type { UiResumeEditorModel, UiResumeSection } from '../../domain'
import { ErrorState, LoadingState } from '../../ui'

/** @brief 移动端编辑器显示面板 / Visible editor pane on compact screens. */
type MobileEditorPane = 'edit' | 'preview' | 'assistant'

/** @brief 单个简历区段的本地编辑草稿 / Local editing draft for one resume section. */
interface ResumeSectionDraft {
  /** @brief 本地编辑后的区段标题 / Locally edited section title. */
  readonly title: string
  /** @brief 本地编辑后的纯文本内容 / Locally edited plain-text content. */
  readonly content: string
}

/**
 * @brief 将区段种类转换为显示名称 / Convert a section kind into a display label.
 * @param section 区段展示模型 / Section display model.
 * @return 用户可见的区段名称 / User-visible section label.
 */
function getSectionLabel(section: UiResumeSection): string {
  return section.title.length > 0 ? section.title : section.kind
}

/**
 * @brief 提取区段可编辑的纯文本内容 / Extract editable plain-text content for a section.
 * @param section 简历区段展示模型 / Resume section display model.
 * @return 适合本地富文本编辑器初始化的纯文本 / Plain text suitable for initializing the local rich-text editor.
 */
function getSectionEditableContent(section: UiResumeSection): string {
  return section.contentPreview ?? section.items.flatMap((item) => item.highlights).join('\n')
}

/**
 * @brief 在当前富文本选择区应用浏览器格式化命令 / Apply a browser formatting command to the current rich-text selection.
 * @param command 浏览器支持的编辑命令 / Browser-supported editing command.
 * @return 无返回值 / No return value.
 * @note v0.1 仅在本地 contenteditable 中演示编辑体验；不会写回 SIR 或调用后端。
 */
function applyLocalRichTextCommand(command: 'bold' | 'formatBlock' | 'insertUnorderedList'): void {
  if (command === 'formatBlock') {
    document.execCommand(command, false, 'blockquote')
    return
  }

  document.execCommand(command)
}

/**
 * @brief 输出简历纸张中的区段内容 / Render a semantic section on the resume paper.
 * @param section 简历区段 / Resume section.
 * @return 视觉预览用的纸张区段 / Paper section for visual preview.
 * @note 这是 SIR 的本地视觉投影，不是 HTML/CSS/LaTeX 的可提交表示。
 */
function ResumePaperSection({
  section,
  draft
}: {
  readonly section: UiResumeSection
  readonly draft: ResumeSectionDraft | undefined
}): React.JSX.Element {
  /** @brief 预览中应显示的区段标题 / Section title displayed in the preview. */
  const title = draft?.title ?? getSectionLabel(section)
  /** @brief 预览中应显示的区段内容 / Section content displayed in the preview. */
  const content = draft?.content ?? section.contentPreview

  return (
    <section className="aw-paper-section">
      <h3>{title}</h3>
      {content !== null && content.length > 0 ? <p>{content}</p> : null}
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
 * @brief 已就绪的三栏简历编辑器 / Ready three-pane resume editor.
 * @param props 编辑器数据 / Editor data.
 * @return 可交互的三栏编辑器 / Interactive three-pane editor.
 */
function ResumeEditorContent({
  editor
}: {
  readonly editor: UiResumeEditorModel
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前选中区段 ID / Currently selected section ID. */
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  /** @brief 小屏幕当前可见面板 / Current compact-screen visible pane. */
  const [mobilePane, setMobilePane] = useState<MobileEditorPane>('preview')
  /** @brief 宽度受限时是否打开聊天抽屉 / Whether the chat drawer is open on constrained widths. */
  const [isChatOpen, setChatOpen] = useState(false)
  /** @brief 聊天输入草稿 / Chat input draft. */
  const [chatDraft, setChatDraft] = useState('')
  /** @brief 本地提交的演示消息 / Locally submitted demo messages. */
  const [submittedMessages, setSubmittedMessages] = useState<readonly string[]>([])
  /** @brief proposal 的本地演示决定 / Local demo decision for the proposal. */
  const [proposalDecision, setProposalDecision] = useState<'pending' | 'accepted' | 'rejected'>(
    'pending'
  )
  /** @brief 各区段的本地草稿 / Local drafts keyed by resume-section ID. */
  const [sectionDrafts, setSectionDrafts] = useState<Readonly<Record<string, ResumeSectionDraft>>>(
    {}
  )
  /** @brief 本地富文本 DOM 节点 / Local rich-text DOM node. */
  const richTextEditorRef = useRef<HTMLDivElement>(null)
  /** @brief 已初始化内容的区段 ID / Section ID whose editor content was initialized. */
  const initializedRichTextSectionIdRef = useRef<string | null>(null)
  /** @brief 当前选中区段 / Currently selected section. */
  const selectedSection = useMemo(
    (): UiResumeSection | null =>
      editor.resume.sections.find((section) => section.id === selectedSectionId) ??
      editor.resume.sections.at(0) ??
      null,
    [editor.resume.sections, selectedSectionId]
  )
  /** @brief 当前选中区段的本地草稿 / Local draft for the selected section. */
  const selectedSectionDraft = useMemo(
    (): ResumeSectionDraft | undefined =>
      selectedSection === null
        ? undefined
        : (sectionDrafts[selectedSection.id] ?? {
            title: selectedSection.title,
            content: getSectionEditableContent(selectedSection)
          }),
    [sectionDrafts, selectedSection]
  )
  /** @brief 是否存在会影响预览的本地草稿 / Whether local drafts currently affect the preview. */
  const hasLocalPreviewDraft = Object.keys(sectionDrafts).length > 0

  /**
   * @brief 只在切换区段时初始化本地富文本 DOM / Initialize the local rich-text DOM only when switching sections.
   * @return 无返回值 / No return value.
   * @note 不把 `innerHTML` 回灌给 React，避免不可信标记注入，也避免输入时抹掉浏览器本地格式。
   */
  useEffect((): void => {
    if (
      selectedSection === null ||
      richTextEditorRef.current === null ||
      initializedRichTextSectionIdRef.current === selectedSection.id
    ) {
      return
    }

    richTextEditorRef.current.textContent = selectedSectionDraft?.content ?? ''
    initializedRichTextSectionIdRef.current = selectedSection.id
  }, [selectedSection, selectedSectionDraft])

  /**
   * @brief 切换紧凑布局下的主面板 / Switch the primary pane in a compact layout.
   * @param pane 将要显示的编辑器面板 / Editor pane to display.
   * @return 无返回值 / No return value.
   */
  const selectMobilePane = (pane: MobileEditorPane): void => {
    setMobilePane(pane)
    setChatOpen(false)
  }

  /**
   * @brief 打开助手并兼容紧凑布局 / Open the assistant while supporting compact layouts.
   * @return 无返回值 / No return value.
   */
  const openAssistant = (): void => {
    setMobilePane('assistant')
    setChatOpen(true)
  }

  /**
   * @brief 关闭助手并回到预览 / Close the assistant and return to preview.
   * @return 无返回值 / No return value.
   */
  const closeAssistant = (): void => {
    setChatOpen(false)
    setMobilePane('preview')
  }

  /**
   * @brief 更新选中区段的本地草稿字段 / Update a local draft field for the selected section.
   * @param field 待更新的草稿字段 / Draft field to update.
   * @param value 新的本地值 / New local value.
   * @return 无返回值 / No return value.
   * @note 该状态只驱动本地预览；在正式 ResumeOperationBatch 契约接入前不会持久化。
   */
  const updateSelectedSectionDraft = (field: keyof ResumeSectionDraft, value: string): void => {
    if (selectedSection === null || selectedSectionDraft === undefined) {
      return
    }

    setSectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [selectedSection.id]: {
        ...selectedSectionDraft,
        [field]: value
      }
    }))
  }

  /**
   * @brief 提交本地演示聊天消息 / Submit a local demo chat message.
   * @param event 表单提交事件 / Form submit event.
   * @return 无返回值 / No return value.
   * @note v0.1 不会发送 AgentRunRequest 或建立 SSE 流。
   */
  const submitChatMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    /** @brief 去除首尾空格后的消息 / Trimmed message. */
    const message = chatDraft.trim()

    if (message.length === 0) {
      return
    }

    setSubmittedMessages((messages) => [...messages, message])
    setChatDraft('')
  }

  return (
    <>
      <div
        aria-label={t('resume.mobileTabs', { defaultValue: '移动端面板切换' })}
        className="aw-mobile-tabs"
      >
        <button
          aria-pressed={mobilePane === 'edit'}
          className="aw-tab"
          onClick={(): void => selectMobilePane('edit')}
          type="button"
        >
          {t('resume.form', { defaultValue: '内容' })}
        </button>
        <button
          aria-pressed={mobilePane === 'preview'}
          className="aw-tab"
          onClick={(): void => selectMobilePane('preview')}
          type="button"
        >
          {t('resume.preview', { defaultValue: '预览' })}
        </button>
        <button
          aria-pressed={mobilePane === 'assistant'}
          className="aw-tab"
          onClick={(): void => selectMobilePane('assistant')}
          type="button"
        >
          {t('resume.assistant', { defaultValue: '简历助手' })}
        </button>
      </div>
      <div
        className={`aw-editor-page ${isChatOpen ? 'aw-editor-page--chat-open' : ''} aw-editor-page--mobile-${mobilePane}`}
      >
        <aside
          className="aw-editor-pane"
          aria-label={t('resume.form', { defaultValue: '简历内容' })}
        >
          <div className="aw-editor-pane-header">
            <h1 className="aw-editor-pane-title">{editor.resume.title}</h1>
            <Link
              aria-label={t('resume.templateSettings', { defaultValue: '打开模板设置' })}
              className="aw-icon-button"
              to={`/resumes/${editor.resume.id}/template`}
            >
              <Settings2 aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="aw-editor-scroll aw-editor-left-body">
            <p className="aw-sidebar-label">{t('resume.form', { defaultValue: '语义区段' })}</p>
            {editor.resume.sections.map((section) => (
              <button
                className={`aw-section-selector ${selectedSection?.id === section.id ? 'aw-section-selector--selected' : ''}`}
                key={section.id}
                onClick={(): void => setSelectedSectionId(section.id)}
                type="button"
              >
                <FileText aria-hidden="true" size={14} strokeWidth={1.65} />
                <span>{getSectionLabel(section)}</span>
                <ChevronRight aria-hidden="true" size={14} style={{ marginLeft: 'auto' }} />
              </button>
            ))}
            {selectedSection !== null ? (
              <div aria-live="polite">
                <div className="aw-editor-field">
                  <label className="aw-editor-label" htmlFor="editor-section-title">
                    {t('resume.editor.sectionTitle', { defaultValue: '区段标题' })}
                  </label>
                  <input
                    className="aw-text-input"
                    onChange={(event): void =>
                      updateSelectedSectionDraft('title', event.target.value)
                    }
                    value={selectedSectionDraft?.title ?? ''}
                    id="editor-section-title"
                  />
                </div>
                <div className="aw-editor-field">
                  <span className="aw-editor-label" id="editor-section-content-label">
                    {t('resume.editor.semanticContent', { defaultValue: '语义内容' })}
                  </span>
                  <div className="aw-rich-text-shell">
                    <div
                      aria-label={t('resume.editor.formatting', { defaultValue: '富文本格式工具' })}
                      className="aw-rich-text-toolbar"
                      role="toolbar"
                    >
                      <button
                        aria-label={t('resume.editor.bold', { defaultValue: '加粗' })}
                        className="aw-icon-button"
                        onMouseDown={(event): void => event.preventDefault()}
                        onClick={(): void => applyLocalRichTextCommand('bold')}
                        type="button"
                      >
                        <Bold aria-hidden="true" size={15} />
                      </button>
                      <button
                        aria-label={t('resume.editor.quote', { defaultValue: '引用块' })}
                        className="aw-icon-button"
                        onMouseDown={(event): void => event.preventDefault()}
                        onClick={(): void => applyLocalRichTextCommand('formatBlock')}
                        type="button"
                      >
                        <Quote aria-hidden="true" size={15} />
                      </button>
                      <button
                        aria-label={t('resume.editor.bullets', { defaultValue: '项目符号列表' })}
                        className="aw-icon-button"
                        onMouseDown={(event): void => event.preventDefault()}
                        onClick={(): void => applyLocalRichTextCommand('insertUnorderedList')}
                        type="button"
                      >
                        <List aria-hidden="true" size={15} />
                      </button>
                    </div>
                    <div
                      aria-labelledby="editor-section-content-label"
                      className="aw-rich-text-editor"
                      contentEditable
                      key={selectedSection.id}
                      onInput={(event): void =>
                        updateSelectedSectionDraft('content', event.currentTarget.textContent ?? '')
                      }
                      ref={richTextEditorRef}
                      role="textbox"
                      suppressContentEditableWarning
                    />
                  </div>
                  <p className="aw-setting-help">
                    {t('resume.editor.semanticHint', {
                      defaultValue:
                        '可在本地编辑富文本预览；保存操作将在正式契约接入后成为 ResumeOperationBatch。'
                    })}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section
          className="aw-editor-pane"
          aria-label={t('resume.preview', { defaultValue: '简历预览' })}
        >
          <div className="aw-editor-pane-header">
            <div className="aw-inline-actions">
              <h2 className="aw-editor-pane-title">
                {t('resume.preview', { defaultValue: '预览' })}
              </h2>
              <span className="aw-chip">
                {t('resume.pdfPreview', { defaultValue: 'PDF 视觉预览（Mock）' })} ·{' '}
                {editor.resume.styleIntent.page.size}
              </span>
              <span
                className={`aw-status ${editor.preview.state === 'ready' ? 'aw-status--ready' : 'aw-status--active'}`}
              >
                {hasLocalPreviewDraft
                  ? t('resume.localDraft', { defaultValue: '本地草稿预览（Mock）' })
                  : editor.preview.state === 'ready'
                    ? t('resume.previewReady', { defaultValue: '预览已同步' })
                    : t('resume.previewRendering', { defaultValue: '正在生成预览' })}
              </span>
            </div>
            <button
              aria-label={t('resume.openAssistant', { defaultValue: '打开简历助手' })}
              className="aw-icon-button"
              onClick={openAssistant}
              type="button"
            >
              <PanelRightOpen aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="aw-editor-scroll aw-editor-preview">
            <article
              aria-label={t('resume.pdfPreviewAria', {
                defaultValue: 'Resume PDF visual preview (Mock)'
              })}
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
                  <ResumePaperSection
                    draft={sectionDrafts[section.id]}
                    key={section.id}
                    section={section}
                  />
                ))}
            </article>
          </div>
        </section>

        <aside
          className="aw-editor-pane aw-chat-panel"
          aria-label={t('resume.assistant', { defaultValue: '简历助手' })}
        >
          <div className="aw-editor-pane-header">
            <div className="aw-inline-actions">
              <Bot aria-hidden="true" color="#9a5938" size={17} />
              <h2 className="aw-editor-pane-title">
                {t('resume.assistant', { defaultValue: '简历助手' })}
              </h2>
            </div>
            <button
              aria-label={t('common.close', { defaultValue: '关闭' })}
              className="aw-icon-button"
              onClick={closeAssistant}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="aw-chat-messages">
            {editor.assistantMessages.map((message) => (
              <div className={`aw-message aw-message--${message.role}`} key={message.id}>
                <p>{message.text}</p>
              </div>
            ))}
            {submittedMessages.map((message, index) => (
              <div className="aw-message aw-message--user" key={`${message}-${index}`}>
                <p>{message}</p>
              </div>
            ))}
            <div className="aw-proposal">
              <p className="aw-proposal-title">
                <WandSparkles
                  aria-hidden="true"
                  size={13}
                  style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
                />
                {t('resume.proposal.title', { defaultValue: '建议修改（需要你的审批）' })}
              </p>
              <div className="aw-proposal-change">
                {t('resume.proposal.change', {
                  defaultValue:
                    '把项目亮点改为“将推理延迟从 1.8s 降至 620ms”，以先呈现可验证的影响。'
                })}
              </div>
              {proposalDecision === 'pending' ? (
                <div className="aw-inline-actions">
                  <button
                    className="aw-primary-button"
                    onClick={(): void => setProposalDecision('accepted')}
                    type="button"
                  >
                    <Check aria-hidden="true" size={13} />
                    {t('resume.proposal.accept', { defaultValue: '接受' })}
                  </button>
                  <button
                    className="aw-quiet-button"
                    onClick={(): void => setProposalDecision('rejected')}
                    type="button"
                  >
                    {t('resume.proposal.reject', { defaultValue: '拒绝' })}
                  </button>
                </div>
              ) : (
                <span
                  className={`aw-status ${proposalDecision === 'accepted' ? 'aw-status--ready' : ''}`}
                >
                  {proposalDecision === 'accepted'
                    ? t('resume.proposal.accepted', {
                        defaultValue: '已接受（Mock，不会写入简历）'
                      })
                    : t('resume.proposal.rejected', { defaultValue: '已拒绝' })}
                </span>
              )}
            </div>
          </div>
          <form
            aria-label={t('resume.assistantMessageForm', {
              defaultValue: 'Resume assistant message'
            })}
            className="aw-chat-composer"
            onSubmit={submitChatMessage}
          >
            <textarea
              aria-label={t('resume.askAssistant', { defaultValue: '询问简历助手' })}
              className="aw-textarea"
              onChange={(event): void => setChatDraft(event.target.value)}
              placeholder={t('resume.askAssistant', { defaultValue: '询问助手如何优化这份简历…' })}
              value={chatDraft}
            />
            <button
              aria-label={t('resume.sendMessage', { defaultValue: 'Send message' })}
              className="aw-icon-button"
              type="submit"
            >
              <Send aria-hidden="true" size={16} />
            </button>
          </form>
        </aside>
      </div>
      <div className="aw-page" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <p className="aw-muted" style={{ margin: 0 }}>
          <Sparkles
            aria-hidden="true"
            color="#9a5938"
            size={14}
            style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
          />
          {t('resume.editor.mockNote', {
            defaultValue:
              '本地草稿会同步到此页的视觉预览；PDF、SSE、持久化与写回操作仍由 Mock adapter 占位。'
          })}
        </p>
      </div>
    </>
  )
}

/**
 * @brief 三栏简历编辑器路由页 / Three-pane resume-editor route page.
 * @return 含 loading、error 与编辑器内容的路由页 / Route page with loading, error, and editor content.
 */
export function ResumeEditorPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由参数 / Route parameters. */
  const { resumeId } = useParams()
  /** @brief 简历 gateway / Resume gateway. */
  const { resume } = useAppGateways()
  /** @brief 路由 ID 的不透明 UI 表达 / Opaque UI representation of the route ID. */
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])
  /** @brief 稳定的编辑器加载器 / Stable editor-data loader. */
  const loadEditor = useCallback(async (): Promise<UiResumeEditorModel> => {
    if (resumeId === undefined) {
      throw new Error('A resume identifier is required to open the editor.')
    }

    return resume.getResumeEditor(requestedResumeId)
  }, [requestedResumeId, resume, resumeId])
  /** @brief 编辑器异步资源 / Editor async resource. */
  const editor = useAsyncResource(loadEditor)

  if (editor.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingResume', { defaultValue: '正在加载简历编辑器…' })} />
      </div>
    )
  }

  if (editor.status === 'error') {
    return (
      <div className="aw-page">
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue:
              'Demo data is temporarily unavailable. Try again or return to the workspace.'
          })}
          title={t('status.errorResume', { defaultValue: '无法加载简历编辑器' })}
        />
      </div>
    )
  }

  return <ResumeEditorContent editor={editor.data} />
}
