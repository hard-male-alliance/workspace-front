import {
  BookOpenCheck,
  Bot,
  CheckCircle2,
  FileText,
  FolderGit2,
  Globe2,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UploadCloud
} from 'lucide-react'
import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAppGateways, useAsyncResource } from '../../app/AppData'
import type { UiKnowledgeSource, UiKnowledgeSourceType } from '../../domain'
import { EmptyState, ErrorState, LoadingState } from '../../ui'

/**
 * @brief 知识来源类型对应的图标 / Icon matching a knowledge-source type.
 * @param sourceType 知识来源类型 / Knowledge-source type.
 * @return 对应的图标组件 / Matching icon component.
 */
function getSourceIcon(sourceType: UiKnowledgeSourceType): React.JSX.Element {
  if (sourceType === 'git_repository') {
    return <FolderGit2 aria-hidden="true" size={19} />
  }

  if (sourceType === 'blog_feed' || sourceType === 'website' || sourceType === 'url') {
    return <Globe2 aria-hidden="true" size={19} />
  }

  if (sourceType === 'resume') {
    return <BookOpenCheck aria-hidden="true" size={19} />
  }

  return <FileText aria-hidden="true" size={19} />
}

/**
 * @brief 根据摄取状态选择视觉样式 / Select a visual style for ingestion status.
 * @param status 摄取状态 / Ingestion status.
 * @return 对应的 CSS 状态类 / Corresponding CSS status class.
 */
function getIngestionTone(status: UiKnowledgeSource['ingestionStatus']): string {
  if (status === 'ready') {
    return 'aw-status--ready'
  }

  if (status === 'failed') {
    return 'aw-status--error'
  }

  return 'aw-status--active'
}

/**
 * @brief 翻译知识来源敏感度 / Translate a knowledge-source sensitivity.
 * @param sensitivity 知识来源敏感度 / Knowledge-source sensitivity.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getSensitivityLabelKey(
  sensitivity: UiKnowledgeSource['visibility']['sensitivity']
): string {
  /** @brief 敏感度到资源 key 的映射 / Mapping from sensitivity to resource key. */
  const labelKeys: Readonly<Record<UiKnowledgeSource['visibility']['sensitivity'], string>> = {
    normal: 'visibility.sensitivity.normal',
    confidential: 'visibility.sensitivity.confidential',
    highly_confidential: 'visibility.sensitivity.highlyConfidential'
  }
  return labelKeys[sensitivity]
}

/**
 * @brief 翻译摄取状态 / Translate an ingestion status.
 * @param status 摄取状态 / Ingestion status.
 * @param translate i18n 翻译函数 / i18n translation function.
 * @return 用户可见状态 / User-visible status.
 */
function getIngestionLabel(
  status: UiKnowledgeSource['ingestionStatus'],
  translate: TFunction
): string {
  /** @brief 状态到本地化 key 的映射 / Mapping from status to localization key. */
  const keys: Readonly<Record<UiKnowledgeSource['ingestionStatus'], string>> = {
    not_started: 'knowledge.status.notStarted',
    queued: 'status.queued',
    fetching: 'knowledge.status.fetching',
    parsing: 'knowledge.status.parsing',
    chunking: 'knowledge.status.chunking',
    embedding: 'status.embedding',
    ready: 'status.ready',
    stale: 'knowledge.status.stale',
    failed: 'status.failed',
    deleted: 'knowledge.status.deleted'
  }
  return translate(keys[status], { defaultValue: status })
}

/**
 * @brief 添加来源的演示表单 / Demo form for adding a source.
 * @param props 关闭回调 / Close callback.
 * @return 无网络副作用的来源表单 / Source form without network side effects.
 */
function MockSourceForm({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 提交后的演示确认状态 / Demo confirmation after submit. */
  const [isSubmitted, setSubmitted] = useState(false)

  /**
   * @brief 提交 Mock 来源表单 / Submit the Mock source form.
   * @param event 表单提交事件 / Form submit event.
   * @return 无返回值 / No return value.
   * @note 真实上传遵循 UploadSession + 对象存储直传，v0.1 不伪造该协议。
   */
  const submitMockSource = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <section
      aria-labelledby="add-source-title"
      className="aw-card aw-card-pad"
      style={{ marginBottom: 18 }}
    >
      <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="aw-card-title" id="add-source-title">
            {t('knowledge.addSource', { defaultValue: '添加知识来源' })}
          </h2>
          <p className="aw-card-description">
            {t('knowledge.addSourceDescription', {
              defaultValue: '支持博客、代码库、URL 和文件；真实上传和连接授权尚待后端接入。'
            })}
          </p>
        </div>
        <button className="aw-quiet-button" onClick={onClose} type="button">
          {t('common.close', { defaultValue: '关闭' })}
        </button>
      </div>
      {isSubmitted ? (
        <div className="aw-proposal" style={{ marginTop: 14 }}>
          <p className="aw-proposal-title">
            <CheckCircle2
              aria-hidden="true"
              size={14}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('knowledge.mockSubmitted', { defaultValue: '已记录为 Mock 操作' })}
          </p>
          <p className="aw-muted" style={{ margin: 0 }}>
            {t('knowledge.mockSubmittedDescription', {
              defaultValue: '不会上传文件、抓取 URL 或创建正式 KnowledgeSource。'
            })}
          </p>
        </div>
      ) : (
        <form onSubmit={submitMockSource}>
          <div
            className="aw-form-row"
            style={{ alignItems: 'end', flexWrap: 'wrap', marginTop: 14 }}
          >
            <label className="aw-editor-field" style={{ flex: '1 1 160px', margin: 0 }}>
              <span className="aw-editor-label">
                {t('knowledge.sourceType', { defaultValue: '来源类型' })}
              </span>
              <select className="aw-select" defaultValue="git_repository">
                <option value="git_repository">
                  {t('knowledge.gitRepository', { defaultValue: '代码仓库' })}
                </option>
                <option value="blog_feed">
                  {t('knowledge.blog', { defaultValue: '博客订阅' })}
                </option>
                <option value="url">{t('knowledge.url', { defaultValue: '网页 URL' })}</option>
                <option value="file">{t('knowledge.file', { defaultValue: '文件' })}</option>
              </select>
            </label>
            <label className="aw-editor-field" style={{ flex: '2 1 250px', margin: 0 }}>
              <span className="aw-editor-label">
                {t('knowledge.sourceLocation', { defaultValue: '链接或文件名' })}
              </span>
              <input className="aw-text-input" placeholder="https://…" required />
            </label>
            <button className="aw-primary-button" type="submit">
              <Plus aria-hidden="true" size={15} />
              {t('knowledge.addAsMock', { defaultValue: '添加到演示' })}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

/**
 * @brief 已就绪的知识来源管理页 / Ready knowledge-source management page.
 * @param props 知识来源列表 / Knowledge-source list.
 * @return 知识来源管理页面 / Knowledge-source management page.
 */
function KnowledgeContent({
  sources
}: {
  readonly sources: readonly UiKnowledgeSource[]
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 添加来源面板是否展开 / Whether the add-source panel is expanded. */
  const [isAddSourceOpen, setAddSourceOpen] = useState(false)
  /** @brief 是否已记录本地刷新请求 / Whether a local refresh request was recorded. */
  const [hasRefreshRequested, setRefreshRequested] = useState(false)

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{t('knowledge.memory', { defaultValue: '个人记忆' })}</p>
          <h1 className="aw-page-title">
            {t('knowledge.title', { defaultValue: '个人记忆与知识库' })}
          </h1>
          <p className="aw-page-description">
            {t('knowledge.resumeAutoSync', {
              defaultValue: '简历会自动作为知识来源加入；删除简历后不会保留幽灵索引。'
            })}
          </p>
        </div>
        <button
          className="aw-primary-button"
          onClick={(): void => setAddSourceOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          {t('knowledge.addSource', { defaultValue: '添加知识来源' })}
        </button>
      </div>

      {isAddSourceOpen ? <MockSourceForm onClose={(): void => setAddSourceOpen(false)} /> : null}

      <div className="aw-knowledge-layout">
        <section aria-labelledby="knowledge-sources-title">
          <div
            className="aw-inline-actions"
            style={{ justifyContent: 'space-between', marginBottom: 12 }}
          >
            <div>
              <h2 className="aw-card-title" id="knowledge-sources-title">
                {sources.length} {t('knowledge.sources', { defaultValue: '个来源' })}
              </h2>
              <p className="aw-card-description">
                {t('knowledge.sourceDescription', {
                  defaultValue: '来源资源表示可同步资料，不暴露 chunk 或向量实现。'
                })}
              </p>
              {hasRefreshRequested ? (
                <p aria-live="polite" className="aw-setting-help" role="status">
                  {t('knowledge.refreshRecorded', {
                    defaultValue: 'Refresh request recorded (Mock; no source sync was started).'
                  })}
                </p>
              ) : null}
            </div>
            <button
              aria-label={t('knowledge.refreshSources', { defaultValue: '刷新知识来源（Mock）' })}
              className="aw-icon-button"
              onClick={(): void => setRefreshRequested(true)}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={15} />
            </button>
          </div>
          {sources.length === 0 ? (
            <EmptyState
              action={
                <button
                  className="aw-primary-button"
                  onClick={(): void => setAddSourceOpen(true)}
                  type="button"
                >
                  {t('knowledge.addSource', { defaultValue: '添加知识来源' })}
                </button>
              }
              description={t('knowledge.emptySources', {
                defaultValue: '还没有知识来源。你可以添加博客、代码仓库或文件。'
              })}
              title={t('common.empty', { defaultValue: '这里还没有内容' })}
              visual={<UploadCloud aria-hidden="true" size={21} />}
            />
          ) : (
            <div className="aw-source-list">
              {sources.map((source) => (
                <article className="aw-source-card" key={source.id}>
                  <span aria-hidden="true" className="aw-source-icon">
                    {getSourceIcon(source.sourceType)}
                  </span>
                  <div>
                    <div className="aw-inline-actions">
                      <h3 className="aw-list-row-title">{source.name}</h3>
                      {source.sourceType === 'resume' ? (
                        <span className="aw-chip">
                          {t('knowledge.autoManaged', { defaultValue: '自动加入' })}
                        </span>
                      ) : null}
                    </div>
                    <p className="aw-list-row-meta">{source.originLabel}</p>
                    <div className="aw-source-meta">
                      <span>
                        {source.documentCount}{' '}
                        {t('knowledge.documents', { defaultValue: '份文档' })}
                      </span>
                      <span>
                        {source.chunkCount} {t('knowledge.chunks', { defaultValue: '个片段' })}
                      </span>
                      <span>
                        {t(getSensitivityLabelKey(source.visibility.sensitivity), {
                          defaultValue: source.visibility.sensitivity
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="aw-inline-actions">
                    <span className={`aw-status ${getIngestionTone(source.ingestionStatus)}`}>
                      {getIngestionLabel(source.ingestionStatus, t)}
                    </span>
                    <Link
                      aria-label={t('knowledge.visibilityForSource', {
                        sourceName: source.name,
                        defaultValue: `${source.name} 的可见性设置`
                      })}
                      className="aw-icon-button"
                      to={`/knowledge/${source.id}/visibility`}
                    >
                      <ShieldCheck aria-hidden="true" size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="aw-card aw-card-pad">
          <div className="aw-inline-actions">
            <Bot aria-hidden="true" color="#9a5938" size={18} />
            <div>
              <h2 className="aw-card-title">
                {t('knowledge.agentBoundary', { defaultValue: 'Agent 访问边界' })}
              </h2>
              <p className="aw-card-description">
                {t('knowledge.agentBoundaryDescription', {
                  defaultValue: '策略和会话选择共同决定有效可见性。'
                })}
              </p>
            </div>
          </div>
          <div className="aw-list-row">
            <span className="aw-muted">
              {t('knowledge.defaultPolicy', { defaultValue: '默认策略' })}
            </span>
            <span className="aw-status aw-status--active">
              {t('knowledge.denied', { defaultValue: '拒绝' })}
            </span>
          </div>
          <div className="aw-list-row">
            <span className="aw-muted">
              {t('knowledge.externalModel', { defaultValue: '外部模型处理' })}
            </span>
            <span className="aw-status">{t('knowledge.off', { defaultValue: '关闭' })}</span>
          </div>
          <p className="aw-setting-help" style={{ marginBottom: 0 }}>
            <Link to="/knowledge/ks_mock_git/visibility">
              <Link2
                aria-hidden="true"
                size={13}
                style={{ marginRight: 4, verticalAlign: 'text-bottom' }}
              />
              {t('knowledge.reviewPolicy', { defaultValue: '查看一个来源的授权矩阵' })}
            </Link>
          </p>
        </aside>
      </div>
    </div>
  )
}

/**
 * @brief 知识库管理路由页 / Knowledge-management route page.
 * @return 含 loading、error 与知识来源列表的路由页 / Route page with loading, error, and source list.
 */
export function KnowledgePage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 工作区 gateway / Workspace gateway. */
  const { knowledge, workspace } = useAppGateways()
  /** @brief 稳定的知识来源加载器 / Stable knowledge-source loader. */
  const loadSources = useCallback(async (): Promise<readonly UiKnowledgeSource[]> => {
    /** @brief 可访问工作区 / Accessible workspaces. */
    const workspaces = await workspace.listWorkspaces()
    /** @brief 当前工作区 / Current workspace. */
    const currentWorkspace = workspaces.at(0)

    if (currentWorkspace === undefined) {
      throw new Error('No workspace is available for knowledge sources.')
    }

    return knowledge.listKnowledgeSources(currentWorkspace.id)
  }, [knowledge, workspace])
  /** @brief 知识来源异步资源 / Knowledge-source async resource. */
  const sources = useAsyncResource(loadSources)

  if (sources.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('status.loadingKnowledge', { defaultValue: '正在加载个人知识库…' })}
        />
      </div>
    )
  }

  if (sources.status === 'error') {
    return (
      <div className="aw-page">
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue:
              'Demo data is temporarily unavailable. Try again or return to the workspace.'
          })}
          title={t('status.errorKnowledge', { defaultValue: '无法加载知识来源' })}
        />
      </div>
    )
  }

  return <KnowledgeContent sources={sources.data} />
}
