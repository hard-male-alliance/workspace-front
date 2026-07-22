import { ArrowRight, FilePlus2, FileText, Files } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useResumeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { ResumeGateway } from '../application/gateway'
import {
  asUiResumePageLimit,
  type UiResumeCursor,
  type UiResumeSummary,
  type UiResumeSummaryPage
} from '../domain/models'

/** @brief Resume library 每次请求的固定页大小 / Fixed request page size for the Resume library. */
const RESUME_LIBRARY_PAGE_LIMIT = asUiResumePageLimit(24)

/** @brief Resume library 首页的 Workspace 权威结果 / Workspace-authority result for the first Resume-library page. */
type ResumeListAuthority =
  | {
      /** @brief 当前会话没有可用 Workspace / The current session has no selected Workspace. */
      readonly kind: 'no-workspace'
      /** @brief 首页请求代际 / First-page request generation. */
      readonly generation: number
    }
  | {
      /** @brief 已取得 Workspace 内的 ResumeSummary 页 / A ResumeSummary page was loaded in a Workspace. */
      readonly kind: 'workspace'
      /** @brief 首页请求代际 / First-page request generation. */
      readonly generation: number
      /** @brief 权威首页 / Authoritative first page. */
      readonly page: UiResumeSummaryPage
      /** @brief 当前 Workspace ID / Current Workspace ID. */
      readonly workspaceId: UiWorkspaceId
      /** @brief 当前 Workspace 展示名 / Current Workspace display name. */
      readonly workspaceName: string
    }

/** @brief 后续页独立于首页的加载状态 / Continuation state independent from the first-page state. */
type ResumeContinuationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly cursor: UiResumeCursor }
  | { readonly status: 'error'; readonly cursor: UiResumeCursor; readonly error: unknown }

/** @brief ResumeSummary 卡片属性 / ResumeSummary-card properties. */
interface ResumeSummaryCardProps {
  /** @brief 应用的当前语言 / Current application locale. */
  readonly applicationLocale: string
  /** @brief 待呈现的摘要 / Summary to present. */
  readonly summary: UiResumeSummary
}

/** @brief 已加载 ResumeSummary 集合属性 / Loaded ResumeSummary-collection properties. */
interface ResumeSummaryCollectionProps {
  /** @brief Resume 应用端口 / Resume application port. */
  readonly gateway: ResumeGateway
  /** @brief 权威首页 / Authoritative first page. */
  readonly initialPage: UiResumeSummaryPage
  /** @brief 创建该列表的 Workspace 选择修订 / Workspace-selection revision that created this list. */
  readonly selectionRevision: number
  /** @brief Workspace 会话端口 / Workspace-session port. */
  readonly workspaceSession: ReturnType<typeof useWorkspaceSession>
  /** @brief 当前 Workspace ID / Current Workspace ID. */
  readonly workspaceId: UiWorkspaceId
}

/**
 * @brief 在列表顺序不变的前提下按 Resume ID 去重 / Deduplicate by Resume ID while preserving list order.
 * @param current 已接受的摘要 / Already accepted summaries.
 * @param incoming 新加载的摘要 / Newly loaded summaries.
 * @return 每个 ID 最多一条、且新投影取代旧投影的列表 / Ordered list with at most one item per ID and newer projections replacing older ones.
 */
function mergeResumeSummaries(
  current: readonly UiResumeSummary[],
  incoming: readonly UiResumeSummary[]
): readonly UiResumeSummary[] {
  /** @brief 保留首次插入顺序的 ID 索引 / ID index preserving first-insertion order. */
  const summariesById = new Map(current.map((summary) => [summary.id, summary]))
  for (const summary of incoming) summariesById.set(summary.id, summary)
  return [...summariesById.values()]
}

/**
 * @brief 格式化服务端 ISO 时刻 / Format a service ISO timestamp.
 * @param timestamp 经契约校验的 ISO 时刻 / Contract-validated ISO timestamp.
 * @param locale 应用语言 / Application locale.
 * @return 本地化的日期与时间 / Localized date and time.
 */
function formatTimestamp(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

/**
 * @brief 将 BCP 47 内容语言转为人类可读名称 / Turn a BCP 47 content locale into a human-readable name.
 * @param contentLocale Resume 内容语言 / Resume content locale.
 * @param applicationLocale 应用语言 / Application locale.
 * @return 本地化语言名，不可用时返回原 locale / Localized language name, or the original locale when unavailable.
 */
function formatContentLocale(contentLocale: string, applicationLocale: string): string {
  try {
    return (
      new Intl.DisplayNames([applicationLocale], { type: 'language' }).of(contentLocale) ??
      contentLocale
    )
  } catch {
    return contentLocale
  }
}

/**
 * @brief 呈现一条可打开的 ResumeSummary / Present one openable ResumeSummary.
 * @param props 摘要与应用语言 / Summary and application locale.
 * @return 仅使用 API v2 真实字段的列表卡片 / List card using only real API v2 fields.
 */
function ResumeSummaryCard({
  applicationLocale,
  summary
}: ResumeSummaryCardProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()

  return (
    <li className="aw-resume-summary-card">
      <Link className="aw-resume-summary-link" to={`/resumes/${summary.id}/edit`}>
        <span aria-hidden="true" className="aw-resume-summary-icon">
          <FileText size={20} strokeWidth={1.7} />
        </span>
        <span className="aw-resume-summary-copy">
          <strong>{summary.title}</strong>
          <span className="aw-resume-summary-meta">
            <span>{formatContentLocale(summary.locale, applicationLocale)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {t('resume.library.templateVersion', {
                defaultValue: '模板 {{templateId}} · v{{version}}',
                templateId: summary.templateId,
                version: summary.templateVersion
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t('resume.revision', {
                defaultValue: '版本 {{revision}}',
                revision: summary.revision
              })}
            </span>
          </span>
          <span className="aw-resume-summary-updated">
            {t('resume.library.updatedAt', { defaultValue: '更新于' })}{' '}
            <time dateTime={summary.updatedAt}>
              {formatTimestamp(summary.updatedAt, applicationLocale)}
            </time>
          </span>
        </span>
        <span aria-hidden="true" className="aw-resume-summary-open">
          <ArrowRight size={18} strokeWidth={1.8} />
        </span>
      </Link>
    </li>
  )
}

/**
 * @brief 呈现已加载摘要并独立控制后续页 / Present loaded summaries and independently control continuation pages.
 * @param props 列表权威、端口与 Workspace 身份 / List authority, port, and Workspace identity.
 * @return 可去重加载更多的摘要集合 / Summary collection capable of deduplicated continuation loading.
 */
function ResumeSummaryCollection({
  gateway,
  initialPage,
  selectionRevision,
  workspaceId,
  workspaceSession
}: ResumeSummaryCollectionProps): React.JSX.Element {
  /** @brief 翻译与应用语言 / Translation and application locale. */
  const { i18n, t } = useTranslation()
  /** @brief 已去重的所有摘要 / All deduplicated summaries. */
  const [summaries, setSummaries] = useState<readonly UiResumeSummary[]>(initialPage.items)
  /** @brief 最近接受的页关系 / Most recently accepted page relation. */
  const [page, setPage] = useState<UiResumeSummaryPage>(initialPage)
  /** @brief 与首页错误独立的后续页状态 / Continuation state independent from first-page failures. */
  const [continuation, setContinuation] = useState<ResumeContinuationState>({ status: 'idle' })
  /** @brief 辅助技术播报的最近追加数 / Most recent append count announced to assistive technology. */
  const [appendedCount, setAppendedCount] = useState(0)
  /** @brief 当前后续页请求控制器 / Current continuation-request controller. */
  const continuationController = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => () => {
      continuationController.current?.abort(
        new DOMException('Resume list identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 加载当前关系声明的下一页 / Load the next page declared by the current relation. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (
      !page.hasMore ||
      continuation.status === 'loading' ||
      continuationController.current !== null
    ) {
      return
    }

    /** @brief 本次请求严格绑定的 cursor / Cursor strictly bound to this request. */
    const cursor = page.nextCursor
    /** @brief 本次后续页专属的取消控制器 / Abort controller dedicated to this continuation page. */
    const controller = new AbortController()
    continuationController.current = controller
    setContinuation({ cursor, status: 'loading' })

    try {
      /** @brief 服务端权威后续页 / Authoritative continuation page from the service. */
      const nextPage = await gateway.listResumeSummariesPage({
        cursor,
        limit: RESUME_LIBRARY_PAGE_LIMIT,
        signal: controller.signal,
        workspaceId
      })
      if (
        controller.signal.aborted ||
        workspaceSession.getSelectionRevision() !== selectionRevision
      ) {
        return
      }
      if (nextPage.hasMore && nextPage.nextCursor === cursor) {
        throw new Error('The Resume pagination cursor did not advance.')
      }

      /** @brief 合并后的去重摘要 / Deduplicated summaries after merging. */
      const merged = mergeResumeSummaries(summaries, nextPage.items)
      setAppendedCount(Math.max(0, merged.length - summaries.length))
      setSummaries(merged)
      setPage(nextPage)
      setContinuation({ status: 'idle' })
    } catch (error: unknown) {
      if (!controller.signal.aborted) setContinuation({ cursor, error, status: 'error' })
    } finally {
      if (continuationController.current === controller) continuationController.current = null
    }
  }, [
    continuation.status,
    gateway,
    page,
    selectionRevision,
    summaries,
    workspaceId,
    workspaceSession
  ])

  if (summaries.length === 0 && !page.hasMore) {
    return (
      <EmptyState
        action={
          <Link className="aw-primary-button" to="/resumes/new">
            <FilePlus2 aria-hidden="true" size={17} strokeWidth={1.8} />
            {t('resume.library.create', { defaultValue: '新建简历' })}
          </Link>
        }
        className="aw-resume-library-state"
        description={t('resume.library.emptyDescription', {
          defaultValue: '当前工作区还没有简历。新建后会显示在这里。'
        })}
        title={t('resume.library.emptyTitle', { defaultValue: '还没有简历' })}
        visual={<Files aria-hidden="true" size={22} />}
      />
    )
  }

  return (
    <section aria-labelledby="resume-library-results" className="aw-resume-library-results">
      <h2 className="aw-sr-only" id="resume-library-results">
        {t('resume.library.results', { defaultValue: '简历列表' })}
      </h2>
      <ul className="aw-resume-summary-list" id="resume-library-items">
        {summaries.map((summary) => (
          <ResumeSummaryCard applicationLocale={i18n.language} key={summary.id} summary={summary} />
        ))}
      </ul>

      <p aria-live="polite" className="aw-sr-only">
        {appendedCount > 0
          ? t('resume.library.appended', {
              count: appendedCount,
              defaultValue: '已加载 {{count}} 份简历'
            })
          : ''}
      </p>

      {continuation.status === 'error' ? (
        <div className="aw-resume-load-more-error" role="alert">
          <div>
            <strong>
              {t('resume.library.loadMoreError', { defaultValue: '无法加载更多简历' })}
            </strong>
            <p>
              <ResourceFailureMessage error={continuation.error} />
            </p>
          </div>
          <button className="aw-quiet-button" onClick={() => void loadMore()} type="button">
            {t('common.retry', { defaultValue: '重试' })}
          </button>
        </div>
      ) : null}

      {page.hasMore ? (
        <div className="aw-resume-load-more">
          <button
            aria-controls="resume-library-items"
            className="aw-quiet-button"
            disabled={continuation.status === 'loading'}
            onClick={() => void loadMore()}
            type="button"
          >
            {continuation.status === 'loading' ? (
              <LoadingState
                label={t('resume.library.loadingMore', { defaultValue: '正在加载更多简历…' })}
              />
            ) : (
              t('resume.library.loadMore', { defaultValue: '加载更多' })
            )}
          </button>
        </div>
      ) : summaries.length > 0 ? (
        <p className="aw-resume-library-end">
          {t('resume.library.end', { defaultValue: '已显示当前工作区的全部简历' })}
        </p>
      ) : null}
    </section>
  )
}

/**
 * @brief API v2 Resume library 路由页 / API v2 Resume-library route page.
 * @return 具有首页与后续页独立状态的真实 ResumeSummary 列表 / Real ResumeSummary list with independent initial and continuation states.
 * @note Workspace 切换会立即改变资源身份、abort 旧请求并丢弃迟到结果 / Changing Workspace immediately changes resource identity, aborts stale requests, and discards late results.
 */
export function ResumeListPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief Resume 领域端口 / Resume domain port. */
  const resumeGateway = useResumeGateway()
  /** @brief Workspace 会话端口 / Workspace-session port. */
  const workspaceSession = useWorkspaceSession()
  /** @brief 首页请求的单调代际 / Monotonic generation for first-page requests. */
  const firstPageGeneration = useRef(0)
  /** @brief 发生 Workspace 切换时立即失效旧列表的修订 / Revision immediately invalidating an old list when Workspace changes. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )

  /** @brief 读取当前 Workspace 的权威首页 / Read the authoritative first page for the current Workspace. */
  const loadFirstPage = useCallback(
    async (signal: AbortSignal): Promise<ResumeListAuthority> => {
      /** @brief 本次首页请求的唯一代际 / Unique generation for this first-page request. */
      const generation = (firstPageGeneration.current += 1)
      /** @brief 读取时的当前 Workspace / Current Workspace at read time. */
      const workspace = await workspaceSession.getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      if (workspace === undefined) return { generation, kind: 'no-workspace' }

      /** @brief 当前 Workspace 的 ResumeSummary 首页 / First ResumeSummary page for the current Workspace. */
      const page = await resumeGateway.listResumeSummariesPage({
        cursor: null,
        limit: RESUME_LIBRARY_PAGE_LIMIT,
        signal,
        workspaceId: workspace.id
      })
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      return {
        generation,
        kind: 'workspace',
        page,
        workspaceId: workspace.id,
        workspaceName: workspace.name
      }
    },
    [resumeGateway, selectionRevision, workspaceSession]
  )
  /** @brief 具有 abort 和 stale-result 防护的首页资源 / First-page resource guarded against aborts and stale results. */
  const authority = useAsyncResource('resume.entry', loadFirstPage, selectionRevision)

  if (authority.status === 'loading') {
    return (
      <div className="aw-page aw-resume-library-page">
        <LoadingState
          className="aw-resume-library-loading"
          label={t('resume.library.loading', { defaultValue: '正在加载简历库…' })}
        />
      </div>
    )
  }

  if (authority.status === 'error') {
    return (
      <div className="aw-page aw-resume-library-page">
        <ResourceErrorState
          error={authority.error}
          onRetry={authority.retry}
          title={t('resume.library.error', { defaultValue: '无法加载简历库' })}
        />
      </div>
    )
  }

  if (authority.data.kind === 'no-workspace') {
    return (
      <div className="aw-page aw-resume-library-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/">
              {t('common.backHome', { defaultValue: '返回工作台' })}
            </Link>
          }
          className="aw-resume-library-state"
          description={t('resume.library.noWorkspaceDescription', {
            defaultValue: '选择一个可访问的工作区后，即可查看其中的简历。'
          })}
          title={t('resume.library.noWorkspaceTitle', { defaultValue: '尚未选择工作区' })}
          visual={<Files aria-hidden="true" size={22} />}
        />
      </div>
    )
  }

  return (
    <div className="aw-page aw-resume-library-page">
      <header className="aw-page-header aw-resume-library-header">
        <div>
          <p className="aw-eyebrow">{authority.data.workspaceName}</p>
          <h1 className="aw-page-title">{t('resume.library.title', { defaultValue: '简历库' })}</h1>
          <p className="aw-page-description">
            {t('resume.library.description', {
              defaultValue: '浏览并继续编辑当前工作区的简历。'
            })}
          </p>
        </div>
        <Link className="aw-primary-button" to="/resumes/new">
          <FilePlus2 aria-hidden="true" size={17} strokeWidth={1.8} />
          {t('resume.library.create', { defaultValue: '新建简历' })}
        </Link>
      </header>
      <ResumeSummaryCollection
        gateway={resumeGateway}
        initialPage={authority.data.page}
        key={`${selectionRevision}:${authority.data.generation}`}
        selectionRevision={selectionRevision}
        workspaceId={authority.data.workspaceId}
        workspaceSession={workspaceSession}
      />
    </div>
  )
}
