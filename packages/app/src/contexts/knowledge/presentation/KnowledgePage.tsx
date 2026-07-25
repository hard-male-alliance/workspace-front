/** @file API v2 KnowledgeSource 列表页 / API v2 KnowledgeSource library page. */

import {
  BookOpenCheck,
  ChevronRight,
  FileText,
  FolderGit2,
  Globe2,
  Plus,
  RefreshCw,
  Search
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useKnowledgeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { KnowledgeGateway } from '../application/gateway'
import {
  asUiKnowledgeSourcePageLimit,
  type UiKnowledgeSource,
  type UiKnowledgeSourceCursor,
  type UiKnowledgeSourcePage,
  type UiKnowledgeSourceType
} from '../domain/models'
import {
  getKnowledgeIngestionLabel,
  getKnowledgeIngestionTone,
  getKnowledgeSensitivityLabel,
  getKnowledgeSourceTypeLabel
} from './knowledge-source-presentation'

/** @brief Knowledge library 每次请求的固定页大小 / Fixed page size for Knowledge library requests. */
const KNOWLEDGE_LIBRARY_PAGE_LIMIT = asUiKnowledgeSourcePageLimit(24)

/** @brief Knowledge library 首页的 Workspace 权威结果 / Workspace authority for the first KnowledgeSource page. */
type KnowledgeListAuthority =
  | {
      /** @brief 当前会话没有可用 Workspace / The current session has no selected Workspace. */
      readonly kind: 'no-workspace'
      /** @brief 首页请求代际 / First-page request generation. */
      readonly generation: number
    }
  | {
      /** @brief 已取得 Workspace 内的 KnowledgeSource 页 / A KnowledgeSource page was loaded in a Workspace. */
      readonly kind: 'workspace'
      /** @brief 首页请求代际 / First-page request generation. */
      readonly generation: number
      /** @brief 权威首页 / Authoritative first page. */
      readonly page: UiKnowledgeSourcePage
      /** @brief 当前 Workspace ID / Current Workspace ID. */
      readonly workspaceId: UiWorkspaceId
      /** @brief 当前 Workspace 展示名 / Current Workspace display name. */
      readonly workspaceName: string
    }

/** @brief 后续页独立于当前列表的加载状态 / Continuation state independent from the current list. */
type KnowledgeContinuationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly cursor: UiKnowledgeSourceCursor }
  | {
      readonly status: 'error'
      readonly cursor: UiKnowledgeSourceCursor
      readonly error: unknown
    }

/** @brief 首页刷新状态 / First-page refresh state. */
type KnowledgeRefreshState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'completed'; readonly loadedCount: number }
  | { readonly status: 'error'; readonly error: unknown }

/** @brief 已加载 KnowledgeSource 集合属性 / Loaded KnowledgeSource-collection properties. */
interface KnowledgeSourceCollectionProps {
  /** @brief Knowledge 应用端口 / Knowledge application port. */
  readonly gateway: KnowledgeGateway
  /** @brief 权威首页 / Authoritative first page. */
  readonly initialPage: UiKnowledgeSourcePage
  /** @brief 创建列表的 Workspace 选择修订 / Workspace-selection revision that created the list. */
  readonly selectionRevision: number
  /** @brief 当前 Workspace ID / Current Workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief Workspace 会话端口 / Workspace-session port. */
  readonly workspaceSession: ReturnType<typeof useWorkspaceSession>
}

/**
 * @brief Knowledge cursor 或 Source identity 重复时的运行时完整性错误 / Runtime integrity error for repeated Knowledge cursors or source identities.
 * @note 不包含 cursor、Source ID 或响应正文，避免把服务端值带入展示层 / It contains no cursor, Source ID, or response body so server values never reach presentation.
 */
class KnowledgeListIntegrityError extends Error {
  override readonly name = 'KnowledgeListIntegrityError'

  /**
   * @brief 构造低敏感分页完整性错误 / Construct a low-sensitivity pagination-integrity error.
   * @param reason 稳定低基数原因 / Stable low-cardinality reason.
   */
  constructor(reason: 'duplicate-id' | 'repeated-cursor' | 'wrong-workspace') {
    super(`KnowledgeSource page failed an integrity check (${reason}).`)
  }
}

/**
 * @brief 选择知识来源图标 / Select a KnowledgeSource icon.
 * @param sourceType 来源类型 / Source type.
 * @return 与来源类型对应的装饰图标 / Decorative icon corresponding to the source type.
 */
function getSourceIcon(sourceType: UiKnowledgeSourceType): React.JSX.Element {
  if (sourceType === 'git_repository') return <FolderGit2 aria-hidden="true" size={19} />
  if (sourceType === 'blog_feed' || sourceType === 'website' || sourceType === 'url') {
    return <Globe2 aria-hidden="true" size={19} />
  }
  if (sourceType === 'resume') return <BookOpenCheck aria-hidden="true" size={19} />
  return <FileText aria-hidden="true" size={19} />
}

/**
 * @brief 从公开配置选择一个可展示的来源事实 / Select one displayable source fact from public config.
 * @param source KnowledgeSource 权威投影 / Authoritative KnowledgeSource projection.
 * @return 未改写的公开配置值；不存在时为 null / Unmodified public-config value, or null when absent.
 */
function getPublicConfigSummary(source: UiKnowledgeSource): string | null {
  /** @brief 不含 secret 的公开配置 / Secret-free public config. */
  const config = source.publicConfig
  return (
    config.filename ??
    config.url ??
    config.cloneUrl ??
    config.resumeId ??
    (typeof config.ref === 'string' ? config.ref : null)
  )
}

/**
 * @brief 构造只覆盖已加载来源的筛选文本 / Build filter text covering loaded sources only.
 * @param source 已加载来源 / Loaded source.
 * @return 用于本地筛选的规范文本 / Normalized text used by the local filter.
 */
function getLoadedSourceFilterText(source: UiKnowledgeSource): string {
  /** @brief 可展示公开配置事实 / Displayable public-config fact. */
  const publicSummary = getPublicConfigSummary(source)
  return `${source.name} ${source.sourceType} ${publicSummary ?? ''}`.toLocaleLowerCase()
}

/**
 * @brief 校验一页来源可安全成为新列表首页 / Validate a page as a safe new first page.
 * @param page 候选服务端页 / Candidate server page.
 * @param workspaceId 请求绑定的 Workspace / Workspace bound to the request.
 */
function assertFirstPageIntegrity(page: UiKnowledgeSourcePage, workspaceId: UiWorkspaceId): void {
  /** @brief 当前页已出现的 Source ID / Source IDs already seen in this page. */
  const sourceIds = new Set<string>()
  for (const source of page.items) {
    if (source.workspaceId !== workspaceId) throw new KnowledgeListIntegrityError('wrong-workspace')
    if (sourceIds.has(source.id)) throw new KnowledgeListIntegrityError('duplicate-id')
    sourceIds.add(source.id)
  }
}

/**
 * @brief 校验后续页不会重复 cursor 或 Source identity / Validate that a continuation page repeats neither cursor nor source identity.
 * @param page 候选后续页 / Candidate continuation page.
 * @param workspaceId 请求绑定的 Workspace / Workspace bound to the request.
 * @param acceptedSources 已接受来源 / Already accepted sources.
 * @param acceptedCursors 已接受 cursor / Already accepted cursors.
 */
function assertContinuationIntegrity(
  page: UiKnowledgeSourcePage,
  workspaceId: UiWorkspaceId,
  acceptedSources: readonly UiKnowledgeSource[],
  acceptedCursors: ReadonlySet<UiKnowledgeSourceCursor>
): void {
  assertFirstPageIntegrity(page, workspaceId)
  /** @brief 已接受来源 identity / Identities of already accepted sources. */
  const sourceIds = new Set(acceptedSources.map((source) => source.id))
  if (page.items.some((source) => sourceIds.has(source.id))) {
    throw new KnowledgeListIntegrityError('duplicate-id')
  }
  if (page.hasMore && acceptedCursors.has(page.nextCursor)) {
    throw new KnowledgeListIntegrityError('repeated-cursor')
  }
}

/**
 * @brief 从一页关系创建已接受 cursor 集合 / Build the accepted-cursor set from a page relation.
 * @param page 已接受页 / Accepted page.
 * @return 只含非空下一页 cursor 的集合 / Set containing only a non-null continuation cursor.
 */
function acceptedCursorsForPage(page: UiKnowledgeSourcePage): ReadonlySet<UiKnowledgeSourceCursor> {
  return page.hasMore ? new Set([page.nextCursor]) : new Set()
}

/**
 * @brief 呈现一个已加载 KnowledgeSource / Render one loaded KnowledgeSource.
 * @param props 来源事实 / Source facts.
 * @return 只使用 API v2 权威字段的来源卡片 / Source card using only authoritative API v2 fields.
 */
function KnowledgeSourceCard({
  source
}: {
  /** @brief 待呈现来源 / Source to render. */
  readonly source: UiKnowledgeSource
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 可展示公开来源事实 / Displayable public source fact. */
  const publicSummary = getPublicConfigSummary(source)

  return (
    <article className="aw-source-card">
      <span aria-hidden="true" className="aw-source-icon">
        {getSourceIcon(source.sourceType)}
      </span>
      <div>
        <h3 className="aw-list-row-title">{source.name}</h3>
        <p className="aw-list-row-meta">
          {getKnowledgeSourceTypeLabel(source.sourceType, t)}
          {publicSummary === null ? null : (
            <>
              <span aria-hidden="true"> · </span>
              {publicSummary}
            </>
          )}
        </p>
        <div className="aw-source-meta">
          <span>
            {t('knowledge.documentCount', {
              count: source.ingestion.documentCount,
              defaultValue: '{{count}} 份文档'
            })}
          </span>
          <span>
            {t('knowledge.chunkCount', {
              count: source.ingestion.chunkCount,
              defaultValue: '{{count}} 个片段'
            })}
          </span>
          <span>{getKnowledgeSensitivityLabel(source.visibility.sensitivity, t)}</span>
          {!source.enabled ? (
            <span>{t('knowledge.disabled', { defaultValue: '当前未启用' })}</span>
          ) : null}
        </div>
      </div>
      <div className="aw-inline-actions">
        <span
          aria-atomic="true"
          className={`aw-status ${getKnowledgeIngestionTone(source.ingestion.status)}`}
          role="status"
        >
          {getKnowledgeIngestionLabel(source.ingestion.status, t)}
        </span>
        <Link
          aria-label={t('knowledge.viewAuthoritativeSourceDetails', {
            defaultValue: '查看 {{sourceName}} 的权威详情',
            sourceName: source.name
          })}
          className="aw-quiet-button aw-source-detail-button"
          to={`/knowledge/${source.id}`}
        >
          {t('common.review', { defaultValue: '查看' })}
          <ChevronRight aria-hidden="true" size={14} />
        </Link>
      </div>
    </article>
  )
}

/**
 * @brief 呈现已加载来源并控制刷新与后续页 / Render loaded sources and control refresh and continuation reads.
 * @param props 列表权威、端口与 Workspace identity / List authority, gateway, and Workspace identity.
 * @return 保留旧项直到新页通过完整性校验的来源集合 / Source collection retaining old items until a new page passes integrity checks.
 */
function KnowledgeSourceCollection({
  gateway,
  initialPage,
  selectionRevision,
  workspaceId,
  workspaceSession
}: KnowledgeSourceCollectionProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前已接受来源 / Currently accepted sources. */
  const [sources, setSources] = useState<readonly UiKnowledgeSource[]>(initialPage.items)
  /** @brief 最近接受的页关系 / Most recently accepted page relation. */
  const [page, setPage] = useState<UiKnowledgeSourcePage>(initialPage)
  /** @brief 已接受的非空 cursor / Accepted non-null cursors. */
  const [acceptedCursors, setAcceptedCursors] = useState<ReadonlySet<UiKnowledgeSourceCursor>>(() =>
    acceptedCursorsForPage(initialPage)
  )
  /** @brief 只筛选已加载项的用户输入 / User input filtering only loaded items. */
  const [filter, setFilter] = useState('')
  /** @brief 后续页状态 / Continuation-page state. */
  const [continuation, setContinuation] = useState<KnowledgeContinuationState>({
    status: 'idle'
  })
  /** @brief 原子首页刷新状态 / Atomic first-page refresh state. */
  const [refresh, setRefresh] = useState<KnowledgeRefreshState>({ status: 'idle' })
  /** @brief 最近一次追加数 / Number appended by the latest continuation. */
  const [appendedCount, setAppendedCount] = useState(0)
  /** @brief 当前后续页控制器 / Current continuation controller. */
  const continuationController = useRef<AbortController | null>(null)
  /** @brief 当前刷新控制器 / Current refresh controller. */
  const refreshController = useRef<AbortController | null>(null)
  /** @brief 规范化本地筛选词 / Normalized local filter. */
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  /** @brief 仅在已加载来源中筛选出的结果 / Results filtered only from loaded sources. */
  const visibleSources = useMemo(
    () =>
      normalizedFilter.length === 0
        ? sources
        : sources.filter((source) => getLoadedSourceFilterText(source).includes(normalizedFilter)),
    [normalizedFilter, sources]
  )
  /** @brief 任一列表读取是否进行中 / Whether any collection read is in progress. */
  const isReading = continuation.status === 'loading' || refresh.status === 'loading'

  useEffect(
    (): (() => void) => () => {
      continuationController.current?.abort(
        new DOMException('Knowledge list identity changed.', 'AbortError')
      )
      refreshController.current?.abort(
        new DOMException('Knowledge list identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 加载当前关系声明的下一页 / Load the next page declared by the current relation. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (
      !page.hasMore ||
      isReading ||
      continuationController.current !== null ||
      refreshController.current !== null
    ) {
      return
    }

    /** @brief 本请求绑定的 opaque cursor / Opaque cursor bound to this request. */
    const cursor = page.nextCursor
    /** @brief 后续页专属取消控制器 / Abort controller dedicated to this continuation. */
    const controller = new AbortController()
    continuationController.current = controller
    setContinuation({ cursor, status: 'loading' })

    try {
      /** @brief 服务端后续权威页 / Authoritative continuation page from the service. */
      const nextPage = await gateway.listKnowledgeSourcePage({
        cursor,
        limit: KNOWLEDGE_LIBRARY_PAGE_LIMIT,
        signal: controller.signal,
        workspaceId
      })
      controller.signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) return
      assertContinuationIntegrity(nextPage, workspaceId, sources, acceptedCursors)

      setSources((current) => [...current, ...nextPage.items])
      setPage(nextPage)
      setAcceptedCursors((current) => {
        if (!nextPage.hasMore) return current
        return new Set([...current, nextPage.nextCursor])
      })
      setAppendedCount(nextPage.items.length)
      setContinuation({ status: 'idle' })
    } catch (error: unknown) {
      if (!controller.signal.aborted) setContinuation({ cursor, error, status: 'error' })
    } finally {
      if (continuationController.current === controller) continuationController.current = null
    }
  }, [
    acceptedCursors,
    gateway,
    isReading,
    page,
    selectionRevision,
    sources,
    workspaceId,
    workspaceSession
  ])

  /** @brief 从 null cursor 原子刷新首页 / Atomically refresh the first page from a null cursor. */
  const refreshFirstPage = useCallback(async (): Promise<void> => {
    if (
      isReading ||
      continuationController.current !== null ||
      refreshController.current !== null
    ) {
      return
    }

    /** @brief 刷新专属取消控制器 / Abort controller dedicated to this refresh. */
    const controller = new AbortController()
    refreshController.current = controller
    setRefresh({ status: 'loading' })

    try {
      /** @brief 服务端新首页 / New first page from the service. */
      const nextFirstPage = await gateway.listKnowledgeSourcePage({
        cursor: null,
        limit: KNOWLEDGE_LIBRARY_PAGE_LIMIT,
        signal: controller.signal,
        workspaceId
      })
      controller.signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) return
      assertFirstPageIntegrity(nextFirstPage, workspaceId)

      setSources(nextFirstPage.items)
      setPage(nextFirstPage)
      setAcceptedCursors(acceptedCursorsForPage(nextFirstPage))
      setContinuation({ status: 'idle' })
      setAppendedCount(0)
      setRefresh({ loadedCount: nextFirstPage.items.length, status: 'completed' })
    } catch (error: unknown) {
      if (!controller.signal.aborted) setRefresh({ error, status: 'error' })
    } finally {
      if (refreshController.current === controller) refreshController.current = null
    }
  }, [gateway, isReading, selectionRevision, workspaceId, workspaceSession])

  return (
    <>
      <div className="aw-knowledge-toolbar">
        <label className="aw-search-field">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label={t('knowledge.filterLoadedSources', {
              defaultValue: '筛选已加载来源'
            })}
            onChange={(event): void => setFilter(event.target.value)}
            placeholder={t('knowledge.filterLoadedPlaceholder', {
              defaultValue: '筛选已加载来源…'
            })}
            type="search"
            value={filter}
          />
        </label>
        <span aria-atomic="true" className="aw-status" role="status">
          {t('knowledge.loadedCount', {
            count: sources.length,
            defaultValue: '已加载 {{count}} 个来源'
          })}
        </span>
      </div>

      <section
        aria-busy={isReading}
        aria-labelledby="knowledge-sources-title"
        className="aw-card aw-card-pad"
      >
        <div className="aw-inline-actions aw-knowledge-section-heading">
          <div>
            <h2 className="aw-card-title" id="knowledge-sources-title">
              {t('knowledge.sourceListTitle', { defaultValue: '知识来源' })}
            </h2>
            <p className="aw-card-description">
              {t('knowledge.loadedSourceDescription', {
                defaultValue: '当前只筛选已经加载到本页的来源；继续加载可以浏览更多服务端结果。'
              })}
            </p>
          </div>
          <button
            className="aw-quiet-button"
            disabled={isReading}
            onClick={(): void => {
              void refreshFirstPage()
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={14} />
            {refresh.status === 'loading'
              ? t('knowledge.refreshing', { defaultValue: '正在刷新…' })
              : t('knowledge.reloadSources', { defaultValue: '刷新来源' })}
          </button>
        </div>

        {refresh.status === 'error' ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('knowledge.refreshFailed', { defaultValue: '刷新失败，已保留当前来源。' })}
            </strong>{' '}
            <ResourceFailureMessage error={refresh.error} />
            <button
              className="aw-quiet-button"
              onClick={(): void => {
                void refreshFirstPage()
              }}
              type="button"
            >
              {t('common.retry', { defaultValue: '重试' })}
            </button>
          </div>
        ) : null}

        {sources.length === 0 && !page.hasMore ? (
          <EmptyState
            action={
              <Link className="aw-primary-button" to="/knowledge/new">
                <Plus aria-hidden="true" size={15} />
                {t('knowledge.createManualNote', { defaultValue: '新建手动笔记' })}
              </Link>
            }
            description={t('knowledge.v2EmptySourcesDescription', {
              defaultValue: '当前工作区还没有知识来源。可以先创建一条手动笔记。'
            })}
            title={t('knowledge.emptySourcesTitle', { defaultValue: '还没有知识来源' })}
            visual={<FileText aria-hidden="true" size={21} />}
          />
        ) : visibleSources.length === 0 ? (
          <EmptyState
            action={
              <button
                className="aw-primary-button"
                onClick={(): void => setFilter('')}
                type="button"
              >
                {t('knowledge.clearFilter', { defaultValue: '清除筛选' })}
              </button>
            }
            description={t('knowledge.noMatchingLoadedSources', {
              defaultValue: '已加载的来源中没有匹配项；可以清除筛选或继续加载更多来源。'
            })}
            title={t('knowledge.noMatchingLoadedTitle', {
              defaultValue: '已加载来源中没有匹配结果'
            })}
          />
        ) : (
          <div className="aw-source-list" id="knowledge-source-items">
            {visibleSources.map((source) => (
              <KnowledgeSourceCard key={source.id} source={source} />
            ))}
          </div>
        )}

        <p aria-atomic="true" aria-live="polite" className="aw-sr-only">
          {appendedCount > 0
            ? t('knowledge.appendedCount', {
                count: appendedCount,
                defaultValue: '又加载了 {{count}} 个来源'
              })
            : refresh.status === 'completed'
              ? t('knowledge.refreshCompleted', {
                  count: refresh.loadedCount,
                  defaultValue: '刷新完成，当前首页有 {{count}} 个来源'
                })
              : ''}
        </p>

        {continuation.status === 'error' ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('knowledge.loadMoreFailed', {
                defaultValue: '无法接受更多来源，已保留当前列表。'
              })}
            </strong>{' '}
            <ResourceFailureMessage error={continuation.error} />
            <button
              className="aw-quiet-button"
              onClick={(): void => {
                void loadMore()
              }}
              type="button"
            >
              {t('common.retry', { defaultValue: '使用同一页标记重试' })}
            </button>
          </div>
        ) : null}

        {page.hasMore ? (
          <div className="aw-inline-actions aw-knowledge-section-heading">
            <button
              aria-controls="knowledge-source-items"
              className="aw-quiet-button"
              disabled={isReading}
              onClick={(): void => {
                void loadMore()
              }}
              type="button"
            >
              {continuation.status === 'loading'
                ? t('knowledge.loadingMore', { defaultValue: '正在加载更多…' })
                : t('knowledge.loadMore', { defaultValue: '加载更多' })}
            </button>
          </div>
        ) : sources.length > 0 ? (
          <p className="aw-card-description">
            {t('knowledge.loadedEnd', {
              defaultValue: '已显示当前工作区已加载集合的末页。'
            })}
          </p>
        ) : null}
      </section>
    </>
  )
}

/**
 * @brief API v2 KnowledgeSource 列表路由页 / API v2 KnowledgeSource library route page.
 * @return 具有首屏、加载更多与原子刷新的 Workspace-scoped cursor 列表 / Workspace-scoped cursor list with initial, continuation, and atomic-refresh states.
 * @note Workspace 或 principal 改变会立即使旧列表失效并取消在途请求 / A Workspace or principal change immediately invalidates the old list and aborts in-flight requests.
 */
export function KnowledgePage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief Knowledge 应用端口 / Knowledge application port. */
  const knowledge = useKnowledgeGateway()
  /** @brief Workspace 会话端口 / Workspace-session port. */
  const workspaceSession = useWorkspaceSession()
  /** @brief 首页请求单调代际 / Monotonic generation for first-page requests. */
  const firstPageGeneration = useRef(0)
  /** @brief Workspace 或 principal 变化时同步失效旧资源的修订 / Revision synchronously invalidating resources when Workspace or principal changes. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )

  /** @brief 读取当前 Workspace 的 KnowledgeSource 首页 / Read the first KnowledgeSource page in the current Workspace. */
  const loadFirstPage = useCallback(
    async (signal: AbortSignal): Promise<KnowledgeListAuthority> => {
      /** @brief 当前首页请求代际 / Generation of this first-page request. */
      const generation = (firstPageGeneration.current += 1)
      /** @brief 读取时的当前 Workspace / Current Workspace at read time. */
      const workspace = await workspaceSession.getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      if (workspace === undefined) return { generation, kind: 'no-workspace' }

      /** @brief 当前 Workspace 的服务端权威首页 / Authoritative first page in the current Workspace. */
      const page = await knowledge.listKnowledgeSourcePage({
        cursor: null,
        limit: KNOWLEDGE_LIBRARY_PAGE_LIMIT,
        signal,
        workspaceId: workspace.id
      })
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      assertFirstPageIntegrity(page, workspace.id)
      return {
        generation,
        kind: 'workspace',
        page,
        workspaceId: workspace.id,
        workspaceName: workspace.name
      }
    },
    [knowledge, selectionRevision, workspaceSession]
  )
  /** @brief 绑定 Workspace/principal identity 的首页异步资源 / First-page async resource bound to Workspace/principal identity. */
  const authority = useAsyncResource('knowledge.sources', loadFirstPage, selectionRevision)

  if (authority.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('status.loadingKnowledgeSourcesV2', {
            defaultValue: '正在加载知识来源…'
          })}
        />
      </div>
    )
  }

  if (authority.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={authority.error}
          onRetry={authority.retry}
          title={t('status.errorKnowledgeSourcesV2', {
            defaultValue: '无法加载知识来源'
          })}
        />
      </div>
    )
  }

  if (authority.data.kind === 'no-workspace') {
    return (
      <div className="aw-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/">
              {t('common.backHome', { defaultValue: '返回工作台' })}
            </Link>
          }
          description={t('knowledge.noWorkspaceDescription', {
            defaultValue: '选择一个可访问的工作区后，即可浏览其中的知识来源。'
          })}
          title={t('knowledge.noWorkspaceTitle', { defaultValue: '尚未选择工作区' })}
          visual={<FileText aria-hidden="true" size={21} />}
        />
      </div>
    )
  }

  return (
    <div className="aw-page">
      <header className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{authority.data.workspaceName}</p>
          <h1 className="aw-page-title">
            {t('knowledge.v2SourceLibraryTitle', { defaultValue: '知识来源' })}
          </h1>
          <p className="aw-page-description">
            {t('knowledge.v2Description', {
              defaultValue: '浏览当前工作区的资料来源、处理状态与访问策略。'
            })}
          </p>
        </div>
        <Link className="aw-primary-button" to="/knowledge/new">
          <Plus aria-hidden="true" size={15} />
          {t('knowledge.createManualNote', { defaultValue: '新建手动笔记' })}
        </Link>
      </header>

      <KnowledgeSourceCollection
        gateway={knowledge}
        initialPage={authority.data.page}
        key={`${selectionRevision}:${authority.data.generation}`}
        selectionRevision={selectionRevision}
        workspaceId={authority.data.workspaceId}
        workspaceSession={workspaceSession}
      />
    </div>
  )
}
