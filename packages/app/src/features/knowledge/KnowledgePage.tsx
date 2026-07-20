import {
  BookOpenCheck,
  Bot,
  CheckCircle2,
  FileText,
  FolderGit2,
  Globe2,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  UploadCloud
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAppGateways, useAsyncResource } from '../../app/AppData'
import type { KnowledgeGateway } from '../../domain'
import type {
  UiKnowledgeSearchResult,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeSourceType
} from '../../domain'
import { EmptyState, ErrorState, LoadingState } from '../../ui'
import { getKnowledgeErrorMessage } from './knowledge-errors'
import { pollKnowledgeIngestion } from './knowledge-polling'

const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024
const SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'pdf', 'docx'])

function getSourceIcon(sourceType: UiKnowledgeSourceType): React.JSX.Element {
  if (sourceType === 'git_repository') return <FolderGit2 aria-hidden="true" size={19} />
  if (sourceType === 'blog_feed' || sourceType === 'website' || sourceType === 'url') {
    return <Globe2 aria-hidden="true" size={19} />
  }
  if (sourceType === 'resume') return <BookOpenCheck aria-hidden="true" size={19} />
  return <FileText aria-hidden="true" size={19} />
}

function getIngestionTone(status: UiKnowledgeSource['ingestionStatus']): string {
  if (status === 'ready') return 'aw-status--ready'
  if (status === 'failed') return 'aw-status--error'
  return 'aw-status--active'
}

function getSensitivityLabelKey(
  sensitivity: UiKnowledgeSource['visibility']['sensitivity']
): string {
  return {
    normal: 'visibility.sensitivity.normal',
    confidential: 'visibility.sensitivity.confidential',
    highly_confidential: 'visibility.sensitivity.highlyConfidential'
  }[sensitivity]
}

function getIngestionLabel(
  status: UiKnowledgeSource['ingestionStatus'],
  translate: TFunction
): string {
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

interface KnowledgeFileFormProps {
  readonly gateway: KnowledgeGateway
  readonly onClose?: (() => void) | undefined
  readonly onComplete: (sourceId: UiKnowledgeSourceId) => void
  readonly sourceId?: UiKnowledgeSourceId | undefined
}

function KnowledgeFileForm({
  gateway,
  onClose,
  onComplete,
  sourceId
}: KnowledgeFileFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'ingesting' | 'succeeded' | 'error'>(
    'idle'
  )
  const [message, setMessage] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => (): void => {
      controllerRef.current?.abort()
    },
    []
  )

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (phase === 'uploading' || phase === 'ingesting') return
    if (file === null) {
      setPhase('error')
      setMessage(t('knowledge.validation.fileRequired'))
      return
    }

    const extension = file.name.split('.').at(-1)?.toLocaleLowerCase() ?? ''
    if (!SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS.has(extension)) {
      setPhase('error')
      setMessage(t('knowledge.validation.fileType'))
      return
    }
    if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
      setPhase('error')
      setMessage(t('knowledge.validation.fileSize'))
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setPhase('uploading')
    setMessage(t('knowledge.uploading'))

    const upload =
      sourceId === undefined
        ? gateway.uploadKnowledgeSource({
            file,
            ...(name.trim().length === 0 ? {} : { name: name.trim() }),
            signal: controller.signal
          })
        : gateway.uploadKnowledgeSourceVersion({ sourceId, file, signal: controller.signal })

    void upload
      .then(async (accepted) => {
        if (controller.signal.aborted) return
        setPhase('ingesting')
        setMessage(t('knowledge.ingesting'))
        const completed = await pollKnowledgeIngestion({
          gateway,
          jobId: accepted.ingestionJob.id,
          signal: controller.signal
        })
        if (controller.signal.aborted) return
        if (completed.status !== 'succeeded') {
          setPhase('error')
          setMessage(t('knowledge.ingestionFailed'))
          return
        }
        setPhase('succeeded')
        setMessage(t('knowledge.uploadSucceeded'))
        onComplete(accepted.source.id)
      })
      .catch((error: unknown): void => {
        if (controller.signal.aborted) return
        setPhase('error')
        setMessage(getKnowledgeErrorMessage(error, (key) => t(key)))
      })
  }

  const busy = phase === 'uploading' || phase === 'ingesting'
  const title = sourceId === undefined ? t('knowledge.addSource') : t('knowledge.uploadVersion')

  return (
    <section className="aw-card aw-card-pad aw-knowledge-upload">
      <div className="aw-inline-actions aw-knowledge-section-heading">
        <div>
          <h2 className="aw-card-title">{title}</h2>
          <p className="aw-card-description">{t('knowledge.fileHelp')}</p>
        </div>
        {onClose === undefined ? null : (
          <button className="aw-quiet-button" disabled={busy} onClick={onClose} type="button">
            {t('common.close')}
          </button>
        )}
      </div>
      <form className="aw-knowledge-file-form" onSubmit={submit}>
        {sourceId === undefined ? (
          <label className="aw-editor-field">
            <span className="aw-editor-label">{t('knowledge.optionalName')}</span>
            <input
              className="aw-text-input"
              disabled={busy}
              onChange={(event): void => setName(event.target.value)}
              value={name}
            />
          </label>
        ) : null}
        <label className="aw-editor-field">
          <span className="aw-editor-label">
            {sourceId === undefined
              ? t('knowledge.fileLabel')
              : t('knowledge.replacementFileLabel')}
          </span>
          <input
            accept=".txt,.md,.markdown,.pdf,.docx"
            disabled={busy}
            onChange={(event): void => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <div className="aw-inline-actions">
          <button className="aw-primary-button" disabled={busy} type="submit">
            <UploadCloud aria-hidden="true" size={15} />
            {sourceId === undefined ? t('knowledge.uploadFile') : t('knowledge.uploadVersion')}
          </button>
          {busy ? (
            <button
              className="aw-quiet-button"
              onClick={(): void => {
                controllerRef.current?.abort()
                setPhase('idle')
                setMessage(t('knowledge.errors.cancelled'))
              }}
              type="button"
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
      </form>
      {message === null ? null : (
        <p
          aria-live="polite"
          className={
            phase === 'error'
              ? 'aw-knowledge-message aw-knowledge-message--error'
              : 'aw-knowledge-message'
          }
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {phase === 'succeeded' ? <CheckCircle2 aria-hidden="true" size={15} /> : null}
          {message}
        </p>
      )}
    </section>
  )
}

function KnowledgeSearch({
  gateway,
  selectedSourceId
}: {
  readonly gateway: KnowledgeGateway
  readonly selectedSourceId: UiKnowledgeSourceId | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [results, setResults] = useState<readonly UiKnowledgeSearchResult[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => (): void => {
      controllerRef.current?.abort()
    },
    []
  )

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const normalizedQuery = query.trim()
    if (normalizedQuery.length === 0 || status === 'loading') return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus('loading')
    setErrorMessage('')
    void gateway
      .searchKnowledge({
        query: normalizedQuery,
        sourceIds: selectedSourceId === null ? [] : [selectedSourceId],
        signal: controller.signal
      })
      .then((items): void => {
        if (controller.signal.aborted) return
        setResults(items)
        setStatus(items.length === 0 ? 'empty' : 'ready')
      })
      .catch((error: unknown): void => {
        if (controller.signal.aborted) return
        setErrorMessage(getKnowledgeErrorMessage(error, (key) => t(key)))
        setStatus('error')
      })
  }

  return (
    <section
      aria-labelledby="knowledge-search-title"
      className="aw-card aw-card-pad aw-knowledge-search"
    >
      <div>
        <h2 className="aw-card-title" id="knowledge-search-title">
          {t('knowledge.semanticSearch')}
        </h2>
        <p className="aw-card-description">{t('knowledge.semanticSearchHelp')}</p>
      </div>
      <form className="aw-knowledge-search-form" onSubmit={submit}>
        <label className="aw-search-field">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label={t('knowledge.searchLabel')}
            disabled={status === 'loading'}
            onChange={(event): void => setQuery(event.target.value)}
            placeholder={t('knowledge.searchPlaceholder')}
            type="search"
            value={query}
          />
        </label>
        <button className="aw-primary-button" disabled={status === 'loading'} type="submit">
          {status === 'loading' ? t('knowledge.searching') : t('knowledge.searchAction')}
        </button>
      </form>
      {status === 'empty' ? <p className="aw-muted">{t('knowledge.searchEmpty')}</p> : null}
      {status === 'error' ? (
        <p className="aw-knowledge-message aw-knowledge-message--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {status === 'ready' ? (
        <div className="aw-knowledge-search-results">
          {results.map((result) => (
            <article className="aw-knowledge-search-result" key={result.id}>
              <div className="aw-inline-actions aw-knowledge-section-heading">
                <h3 className="aw-list-row-title">{result.title}</h3>
                <span className="aw-status">{result.locatorLabel}</span>
              </div>
              {result.quote === null ? null : <blockquote>{result.quote}</blockquote>}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

interface KnowledgeContentProps {
  readonly gateway: KnowledgeGateway
  readonly initialSelectedSourceId: UiKnowledgeSourceId | null
  readonly onReload: (sourceId: UiKnowledgeSourceId | null) => void
  readonly sources: readonly UiKnowledgeSource[]
}

function KnowledgeContent({
  gateway,
  initialSelectedSourceId,
  onReload,
  sources
}: KnowledgeContentProps): React.JSX.Element {
  const { t } = useTranslation()
  const [isAddSourceOpen, setAddSourceOpen] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [selectedSourceId, setSelectedSourceId] = useState<UiKnowledgeSourceId | null>(
    initialSelectedSourceId ?? sources.at(0)?.id ?? null
  )

  const filteredSources = useMemo(() => {
    const normalizedQuery = sourceQuery.trim().toLocaleLowerCase()
    if (normalizedQuery.length === 0) return sources
    return sources.filter((source) =>
      `${source.name} ${source.originLabel}`.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [sourceQuery, sources])
  const selectedSource =
    filteredSources.find((source) => source.id === selectedSourceId) ??
    filteredSources.at(0) ??
    null

  const completeUpload = (sourceId: UiKnowledgeSourceId): void => {
    setSelectedSourceId(sourceId)
    onReload(sourceId)
  }

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{t('knowledge.memory')}</p>
          <h1 className="aw-page-title">{t('knowledge.title')}</h1>
          <p className="aw-page-description">{t('knowledge.resumeAutoSync')}</p>
        </div>
        <button
          className="aw-primary-button"
          onClick={(): void => setAddSourceOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          {t('knowledge.addSource')}
        </button>
      </div>

      {isAddSourceOpen ? (
        <KnowledgeFileForm
          gateway={gateway}
          onClose={(): void => setAddSourceOpen(false)}
          onComplete={completeUpload}
        />
      ) : null}

      <KnowledgeSearch gateway={gateway} selectedSourceId={selectedSource?.id ?? null} />

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
                <button
                  className="aw-primary-button"
                  onClick={(): void => setAddSourceOpen(true)}
                  type="button"
                >
                  {t('knowledge.addSource')}
                </button>
              }
              description={t('knowledge.noMatchingSources')}
              title={t('common.empty')}
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
                {selectedSource.sourceType === 'file' ? (
                  <KnowledgeFileForm
                    gateway={gateway}
                    key={selectedSource.id}
                    onComplete={completeUpload}
                    sourceId={selectedSource.id}
                  />
                ) : null}
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
            <div className="aw-list-row">
              <span className="aw-muted">{t('knowledge.defaultPolicy')}</span>
              <span className="aw-status aw-status--active">{t('knowledge.denied')}</span>
            </div>
            <div className="aw-list-row">
              <span className="aw-muted">{t('knowledge.externalModel')}</span>
              <span className="aw-status">{t('knowledge.off')}</span>
            </div>
            {selectedSource === null ? null : (
              <p className="aw-setting-help aw-knowledge-policy-link">
                <Link
                  aria-label={t('knowledge.reviewSelectedPolicy')}
                  to={`/knowledge/${selectedSource.id}/visibility`}
                >
                  <Link2 aria-hidden="true" size={13} />
                  {t('knowledge.reviewSelectedPolicy')}
                </Link>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export function KnowledgePage(): React.JSX.Element {
  const { t } = useTranslation()
  const { knowledge, workspace } = useAppGateways()
  const [reloadRevision, setReloadRevision] = useState(0)
  const [requestedSourceId, setRequestedSourceId] = useState<UiKnowledgeSourceId | null>(null)
  const loadSources = useCallback(async (): Promise<readonly UiKnowledgeSource[]> => {
    const workspaces = await workspace.listWorkspaces()
    const currentWorkspace = workspaces.at(0)
    if (currentWorkspace === undefined) {
      throw new Error(
        reloadRevision === 0
          ? 'No workspace is available for knowledge sources.'
          : 'No workspace is available after reloading knowledge sources.'
      )
    }
    return knowledge.listKnowledgeSources(currentWorkspace.id)
  }, [knowledge, reloadRevision, workspace])
  const sources = useAsyncResource(loadSources)
  const reloadSources = useCallback((sourceId: UiKnowledgeSourceId | null): void => {
    setRequestedSourceId(sourceId)
    setReloadRevision((current) => current + 1)
  }, [])

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
        <ErrorState description={t('status.errorDescription')} title={t('status.errorKnowledge')} />
      </div>
    )
  }
  return (
    <KnowledgeContent
      gateway={knowledge}
      initialSelectedSourceId={requestedSourceId}
      key={reloadRevision}
      onReload={reloadSources}
      sources={sources.data}
    />
  )
}
