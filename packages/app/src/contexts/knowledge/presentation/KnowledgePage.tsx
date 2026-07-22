import {
  BookOpenCheck,
  Bot,
  FileText,
  FolderGit2,
  Globe2,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  UploadCloud
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useKnowledgeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import type { UiKnowledgeSourceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { UiKnowledgeSource, UiKnowledgeSourceType } from '../domain/models'

/** @brief 选择知识来源图标 / Select a KnowledgeSource icon. */
function getSourceIcon(sourceType: UiKnowledgeSourceType): React.JSX.Element {
  if (sourceType === 'git_repository') return <FolderGit2 aria-hidden="true" size={19} />
  if (sourceType === 'blog_feed' || sourceType === 'website' || sourceType === 'url') {
    return <Globe2 aria-hidden="true" size={19} />
  }
  if (sourceType === 'resume') return <BookOpenCheck aria-hidden="true" size={19} />
  return <FileText aria-hidden="true" size={19} />
}

/** @brief 选择摄取状态颜色 / Select the ingestion-status tone. */
function getIngestionTone(status: UiKnowledgeSource['ingestionStatus']): string {
  if (status === 'ready') return 'aw-status--ready'
  if (status === 'failed') return 'aw-status--error'
  return 'aw-status--active'
}

/** @brief 获取敏感度翻译键 / Get the sensitivity translation key. */
function getSensitivityLabelKey(
  sensitivity: UiKnowledgeSource['visibility']['sensitivity']
): string {
  return {
    normal: 'visibility.sensitivity.normal',
    confidential: 'visibility.sensitivity.confidential',
    highly_confidential: 'visibility.sensitivity.highlyConfidential'
  }[sensitivity]
}

/** @brief 本地化摄取状态 / Localize an ingestion status. */
function getIngestionLabel(
  status: UiKnowledgeSource['ingestionStatus'],
  translate: TFunction
): string {
  /** @brief 状态到翻译键的完整映射 / Complete status-to-translation-key map. */
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

/** @brief 已加载知识来源页面属性 / Loaded KnowledgeSource-page properties. */
interface KnowledgeContentProps {
  /** @brief 重新加载后应选择的来源 / Source to select after a reload. */
  readonly initialSelectedSourceId: UiKnowledgeSourceId | null
  /** @brief 重新读取权威来源的动作 / Action that reloads authoritative sources. */
  readonly onReload: (sourceId: UiKnowledgeSourceId | null) => void
  /** @brief 当前工作区的权威来源 / Authoritative sources in the current Workspace. */
  readonly sources: readonly UiKnowledgeSource[]
}

/** @brief 已加载的知识来源页面 / Loaded KnowledgeSource page. */
function KnowledgeContent({
  initialSelectedSourceId,
  onReload,
  sources
}: KnowledgeContentProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 来源名称筛选词 / Source-name filter text. */
  const [sourceQuery, setSourceQuery] = useState('')
  /** @brief 当前选中的来源 ID / Currently selected source ID. */
  const [selectedSourceId, setSelectedSourceId] = useState<UiKnowledgeSourceId | null>(
    initialSelectedSourceId ?? sources.at(0)?.id ?? null
  )
  /** @brief 客户端筛选后的权威来源 / Authoritative sources after client-side filtering. */
  const filteredSources = useMemo(() => {
    const normalizedQuery = sourceQuery.trim().toLocaleLowerCase()
    if (normalizedQuery.length === 0) return sources
    return sources.filter((source) =>
      `${source.name} ${source.originLabel}`.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [sourceQuery, sources])
  /** @brief 当前详情面板显示的来源 / Source displayed in the details pane. */
  const selectedSource =
    filteredSources.find((source) => source.id === selectedSourceId) ??
    filteredSources.at(0) ??
    null

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{t('knowledge.memory')}</p>
          <h1 className="aw-page-title">{t('knowledge.title')}</h1>
          <p className="aw-page-description">{t('knowledge.resumeAutoSync')}</p>
        </div>
        <button
          aria-describedby="knowledge-add-source-unavailable"
          aria-disabled="true"
          className="aw-primary-button aw-discoverable-disabled"
          title={t('knowledge.createUnavailable')}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          {t('knowledge.addSource')}
        </button>
        <span className="aw-sr-only" id="knowledge-add-source-unavailable">
          {t('knowledge.createUnavailable')}
        </span>
      </div>

      <section className="aw-card aw-card-pad aw-knowledge-search">
        <div>
          <h2 className="aw-card-title">{t('knowledge.semanticSearch')}</h2>
          <p className="aw-card-description">{t('knowledge.searchUnavailable')}</p>
        </div>
      </section>

      <div className="aw-knowledge-toolbar">
        <label className="aw-search-field">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label={t('knowledge.filterSources')}
            onChange={(event): void => setSourceQuery(event.target.value)}
            placeholder={t('knowledge.filterPlaceholder')}
            type="search"
            value={sourceQuery}
          />
        </label>
        <span className="aw-status">
          {t('knowledge.filteredCount', {
            count: filteredSources.length,
            total: sources.length,
            defaultValue: `${filteredSources.length} / ${sources.length}`
          })}
        </span>
      </div>

      <div className="aw-knowledge-layout">
        <section aria-labelledby="knowledge-sources-title">
          <div className="aw-inline-actions aw-knowledge-section-heading">
            <div>
              <h2 className="aw-card-title" id="knowledge-sources-title">
                {sources.length} {t('knowledge.sources')}
              </h2>
              <p className="aw-card-description">{t('knowledge.sourceDescription')}</p>
            </div>
            <button
              className="aw-quiet-button"
              onClick={(): void => onReload(selectedSource?.id ?? null)}
              type="button"
            >
              {t('knowledge.reloadSources')}
            </button>
          </div>
          {filteredSources.length === 0 ? (
            <EmptyState
              action={
                sources.length === 0 ? (
                  <button
                    aria-describedby="knowledge-add-source-unavailable"
                    aria-disabled="true"
                    className="aw-primary-button aw-discoverable-disabled"
                    title={t('knowledge.createUnavailable')}
                    type="button"
                  >
                    {t('knowledge.addSource')}
                  </button>
                ) : (
                  <button
                    className="aw-primary-button"
                    onClick={(): void => setSourceQuery('')}
                    type="button"
                  >
                    {t('knowledge.clearFilter')}
                  </button>
                )
              }
              description={
                sources.length === 0
                  ? t('knowledge.emptySourcesDescription')
                  : t('knowledge.noMatchingSources')
              }
              title={
                sources.length === 0
                  ? t('knowledge.emptySourcesTitle')
                  : t('knowledge.noMatchingSourcesTitle')
              }
              visual={<UploadCloud aria-hidden="true" size={21} />}
            />
          ) : (
            <div className="aw-source-list">
              {filteredSources.map((source) => (
                <article
                  className={`aw-source-card ${selectedSource?.id === source.id ? 'aw-source-card--selected' : ''}`}
                  key={source.id}
                >
                  <span aria-hidden="true" className="aw-source-icon">
                    {getSourceIcon(source.sourceType)}
                  </span>
                  <div>
                    <div className="aw-inline-actions">
                      <h3 className="aw-list-row-title">{source.name}</h3>
                      {source.sourceType === 'resume' ? (
                        <span className="aw-chip">{t('knowledge.autoManaged')}</span>
                      ) : null}
                    </div>
                    <p className="aw-list-row-meta">{source.originLabel}</p>
                    <div className="aw-source-meta">
                      <span>
                        {source.documentCount} {t('knowledge.documents')}
                      </span>
                      <span>
                        {source.chunkCount} {t('knowledge.chunks')}
                      </span>
                      <span>{t(getSensitivityLabelKey(source.visibility.sensitivity))}</span>
                    </div>
                  </div>
                  <div className="aw-inline-actions">
                    <span className={`aw-status ${getIngestionTone(source.ingestionStatus)}`}>
                      {getIngestionLabel(source.ingestionStatus, t)}
                    </span>
                    <Link
                      aria-label={t('knowledge.visibilityForSource', { sourceName: source.name })}
                      className="aw-icon-button"
                      to={`/knowledge/${source.id}/visibility`}
                    >
                      <ShieldCheck aria-hidden="true" size={15} />
                    </Link>
                    <button
                      aria-label={t('knowledge.viewSourceDetails', { sourceName: source.name })}
                      className="aw-quiet-button aw-source-detail-button"
                      onClick={(): void => setSelectedSourceId(source.id)}
                      type="button"
                    >
                      {t('common.review')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="aw-card aw-card-pad aw-source-detail">
          <div>
            <p className="aw-sidebar-label">{t('knowledge.selectedSource')}</p>
            <h2 className="aw-card-title">{t('knowledge.sourceDetails')}</h2>
            {selectedSource === null ? null : (
              <>
                <p className="aw-source-detail-name">{selectedSource.name}</p>
                <p className="aw-card-description">{selectedSource.originLabel}</p>
                <div className="aw-source-detail-stats">
                  <span>
                    <strong>{selectedSource.documentCount}</strong>
                    {t('knowledge.documents')}
                  </span>
                  <span>
                    <strong>{selectedSource.chunkCount}</strong>
                    {t('knowledge.chunks')}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="aw-source-detail-boundary">
            <div className="aw-inline-actions">
              <Bot aria-hidden="true" className="aw-accent-icon" size={18} />
              <div>
                <h2 className="aw-card-title">{t('knowledge.agentBoundary')}</h2>
                <p className="aw-card-description">{t('knowledge.agentBoundaryDescription')}</p>
              </div>
            </div>
            {selectedSource === null ? null : (
              <>
                <div className="aw-list-row">
                  <span className="aw-muted">{t('knowledge.defaultPolicy')}</span>
                  <span className="aw-status aw-status--active">
                    {selectedSource.visibility.defaultEffect === 'allow'
                      ? t('knowledge.allowed')
                      : t('knowledge.denied')}
                  </span>
                </div>
                <div className="aw-list-row">
                  <span className="aw-muted">{t('knowledge.externalModel')}</span>
                  <span className="aw-status">
                    {selectedSource.visibility.allowExternalModelProcessing
                      ? t('knowledge.on')
                      : t('knowledge.off')}
                  </span>
                </div>
                <p className="aw-setting-help aw-knowledge-policy-link">
                  <Link
                    aria-label={t('knowledge.reviewSelectedPolicy')}
                    to={`/knowledge/${selectedSource.id}/visibility`}
                  >
                    <Link2 aria-hidden="true" size={13} />
                    {t('knowledge.reviewSelectedPolicy')}
                  </Link>
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** @brief 知识来源路由页 / KnowledgeSource route page. */
export function KnowledgePage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief Knowledge 应用端口 / Knowledge application port. */
  const knowledge = useKnowledgeGateway()
  /** @brief 当前 Workspace session / Current Workspace session. */
  const { getCurrentWorkspace } = useWorkspaceSession()
  /** @brief 服务端重读后重置页面内部状态的序号 / Sequence used to reset page-local state after a server reload. */
  const [reloadRevision, setReloadRevision] = useState(0)
  /** @brief 重载后应保持选择的来源 / Source whose selection should survive a reload. */
  const [requestedSourceId, setRequestedSourceId] = useState<UiKnowledgeSourceId | null>(null)
  /** @brief 稳定的来源加载器 / Stable source loader. */
  const loadSources = useCallback(async (): Promise<readonly UiKnowledgeSource[]> => {
    const currentWorkspace = await getCurrentWorkspace()
    if (currentWorkspace === undefined) {
      throw new Error('No workspace is available for knowledge sources.')
    }
    return knowledge.listKnowledgeSources(currentWorkspace.id)
  }, [getCurrentWorkspace, knowledge])
  /** @brief 来源异步资源 / Source async resource. */
  const sources = useAsyncResource('knowledge.sources', loadSources)
  /** @brief 稳定的来源重试动作 / Stable source-retry action. */
  const retrySources = sources.retry
  /** @brief 触发来源权威重读 / Trigger an authoritative source reload. */
  const reloadSources = useCallback(
    (sourceId: UiKnowledgeSourceId | null): void => {
      setRequestedSourceId(sourceId)
      setReloadRevision((current) => current + 1)
      retrySources()
    },
    [retrySources]
  )

  if (sources.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingKnowledge')} />
      </div>
    )
  }
  if (sources.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={sources.error}
          onRetry={sources.retry}
          title={t('status.errorKnowledge')}
        />
      </div>
    )
  }
  return (
    <KnowledgeContent
      initialSelectedSourceId={requestedSourceId}
      key={reloadRevision}
      onReload={reloadSources}
      sources={sources.data}
    />
  )
}
