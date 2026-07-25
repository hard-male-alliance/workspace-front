import { ArrowRight, CalendarDays, Clock3, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useInterviewGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { InterviewGateway } from '../application/gateway'
import {
  asUiInterviewPageLimit,
  type UiInterviewSession,
  type UiInterviewSessionCursor,
  type UiInterviewSessionPage
} from '../domain/models'

/** @brief 会话历史每次读取的固定页大小 / Fixed page size for Interview-session history. */
const INTERVIEW_SESSION_PAGE_LIMIT = asUiInterviewPageLimit(24)

/** @brief Interview 首页的 Workspace 权威 / Workspace authority for the Interview hub. */
type InterviewHubAuthority =
  | { readonly kind: 'no-workspace'; readonly generation: number }
  | {
      readonly kind: 'workspace'
      readonly generation: number
      readonly page: UiInterviewSessionPage
      readonly workspaceId: UiWorkspaceId
      readonly workspaceName: string
    }

/** @brief 与首页独立的后续页状态 / Continuation-page state independent from the first page. */
type InterviewContinuationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly cursor: UiInterviewSessionCursor }
  | {
      readonly status: 'error'
      readonly cursor: UiInterviewSessionCursor
      readonly error: unknown
    }

/** @brief 会话列表属性 / Session-list properties. */
interface InterviewSessionListProps {
  /** @brief Interview REST 端口 / Interview REST port. */
  readonly gateway: InterviewGateway
  /** @brief 已确认首页 / Confirmed first page. */
  readonly initialPage: UiInterviewSessionPage
  /** @brief 创建列表时的 Workspace 选择代际 / Workspace-selection generation that created this list. */
  readonly selectionRevision: number
  /** @brief 当前 Workspace / Current Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief Workspace 会话 / Workspace session. */
  readonly workspaceSession: ReturnType<typeof useWorkspaceSession>
}

/**
 * @brief 按 Session identity 稳定合并页面 / Stably merge pages by Session identity.
 * @param current 已接受的会话 / Already accepted sessions.
 * @param incoming 后续页会话 / Sessions from the following page.
 * @return 保留首次位置并用较新权威替换重复项的集合 / Collection preserving first position while replacing duplicates with newer authority.
 */
function mergeInterviewSessions(
  current: readonly UiInterviewSession[],
  incoming: readonly UiInterviewSession[]
): readonly UiInterviewSession[] {
  /** @brief 保留首次插入顺序的 Session map / Session map preserving first insertion order. */
  const byId = new Map(current.map((session) => [session.id, session]))
  for (const session of incoming) byId.set(session.id, session)
  return [...byId.values()]
}

/**
 * @brief 格式化 API v2 时间戳 / Format an API v2 timestamp.
 * @param value 已验证 ISO 时间 / Validated ISO timestamp.
 * @param locale 当前界面语言 / Current UI locale.
 * @return 本地化日期时间 / Localized date and time.
 */
function formatTimestamp(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

/**
 * @brief 选择最能表达会话进度的权威时间 / Select the authoritative timestamp best representing session progress.
 * @param session 权威 InterviewSession / Authoritative InterviewSession.
 * @return 结束、开始或创建时间 / End, start, or creation timestamp.
 */
function sessionProgressTimestamp(session: UiInterviewSession): string {
  return session.endedAt ?? session.startedAt ?? session.createdAt
}

/**
 * @brief 呈现一条完整 Session 生命周期 / Present one complete Session lifecycle.
 * @param props 会话与界面语言 / Session and UI locale.
 * @return 只读取 Session 事实的可打开记录 / Openable record using only Session facts.
 */
function InterviewSessionRow({
  locale,
  session
}: {
  readonly locale: string
  readonly session: UiInterviewSession
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前状态对应的安全展示文案 / Safe display copy for the current status. */
  const status = t(`interviewSession.status.${session.status}`, {
    defaultValue:
      {
        active: '进行中',
        cancelled: '已取消',
        completed: '已完成',
        connecting: '连接中',
        created: '已创建',
        ending: '正在结束',
        failed: '失败'
      }[session.status] ?? session.status
  })
  /** @brief 当前 Session 可证明的报告状态 / Report state provable from the current Session. */
  const reportStatus =
    session.reportId !== null
      ? t('interviewHub.reportReady', { defaultValue: '报告可查看' })
      : session.status === 'completed'
        ? t('interviewHub.reportPending', { defaultValue: '报告待生成' })
        : t('interviewHub.reportAfterCompletion', { defaultValue: '完成后可生成报告' })
  /** @brief 用于排序之外展示的会话进度时间 / Session-progress time used only for display. */
  const timestamp = sessionProgressTimestamp(session)

  return (
    <li className="aw-interview-history-row">
      <Link
        aria-label={t('interviewHub.openSession', {
          defaultValue: '打开 {{title}} 的面试会话',
          title: session.jobTarget.title
        })}
        className="aw-interview-session-link"
        to={`/interviews/${session.id}`}
      >
        <span className="aw-interview-history-role">
          <strong>{session.jobTarget.title}</strong>
          <small>
            {session.jobTarget.company ??
              t('interviewHub.companyNotSet', { defaultValue: '未设置公司' })}
          </small>
        </span>
        <span className={`aw-status aw-status--interview-${session.status}`}>{status}</span>
        <span className="aw-interview-history-duration">
          <Clock3 aria-hidden="true" size={14} />
          <time dateTime={timestamp}>{formatTimestamp(timestamp, locale)}</time>
        </span>
        <span className="aw-interview-report-state">{reportStatus}</span>
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </li>
  )
}

/**
 * @brief 呈现并增量读取当前 Workspace 的全部 Session / Present and incrementally load all Sessions in the current Workspace.
 * @param props 首页、端口与 Workspace 身份 / First page, port, and Workspace identity.
 * @return 保留已有内容和精确 cursor 重试的会话列表 / Session list preserving loaded content and exact-cursor retries.
 */
function InterviewSessionList({
  gateway,
  initialPage,
  selectionRevision,
  workspaceId,
  workspaceSession
}: InterviewSessionListProps): React.JSX.Element {
  /** @brief 当前界面语言与翻译函数 / Current UI locale and translation function. */
  const { i18n, t } = useTranslation()
  /** @brief 已加载并按 ID 去重的 Session / Loaded Sessions deduplicated by ID. */
  const [sessions, setSessions] = useState<readonly UiInterviewSession[]>(initialPage.items)
  /** @brief 最近接受的分页关系 / Most recently accepted page relation. */
  const [page, setPage] = useState<UiInterviewSessionPage>(initialPage)
  /** @brief 后续页状态 / Continuation-page state. */
  const [continuation, setContinuation] = useState<InterviewContinuationState>({
    status: 'idle'
  })
  /** @brief 最近追加数量，用于辅助技术播报 / Most recent append count for assistive announcement. */
  const [appendedCount, setAppendedCount] = useState(0)
  /** @brief 当前后续页请求控制器 / Current continuation-request controller. */
  const controllerRef = useRef<AbortController | null>(null)
  /** @brief 已成功消费的 cursor；用于阻止服务端循环 / Successfully consumed cursors used to stop server loops. */
  const consumedCursors = useRef(new Set<UiInterviewSessionCursor>())

  useEffect(
    (): (() => void) => () => {
      controllerRef.current?.abort(
        new DOMException('Interview session collection identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 读取或精确重试当前下一页 / Read or exactly retry the current next page. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (!page.hasMore || continuation.status === 'loading' || controllerRef.current !== null) return

    /** @brief 本次调用冻结的服务端 cursor / Server cursor frozen for this call. */
    const cursor = page.nextCursor
    /** @brief 本次调用专属取消控制器 / Abort controller dedicated to this call. */
    const controller = new AbortController()
    controllerRef.current = controller
    setContinuation({ cursor, status: 'loading' })

    try {
      /** @brief 服务端后续页权威 / Authoritative continuation page. */
      const nextPage = await gateway.listInterviewSessionPage({
        cursor,
        limit: INTERVIEW_SESSION_PAGE_LIMIT,
        signal: controller.signal,
        workspaceId
      })
      if (
        controller.signal.aborted ||
        workspaceSession.getSelectionRevision() !== selectionRevision
      ) {
        return
      }
      if (
        consumedCursors.current.has(cursor) ||
        (nextPage.hasMore &&
          (nextPage.nextCursor === cursor || consumedCursors.current.has(nextPage.nextCursor)))
      ) {
        throw new Error('The Interview session pagination cursor did not advance.')
      }

      /** @brief 接受当前 cursor 后的新集合 / New collection after accepting the current cursor. */
      const merged = mergeInterviewSessions(sessions, nextPage.items)
      consumedCursors.current.add(cursor)
      setAppendedCount(Math.max(0, merged.length - sessions.length))
      setSessions(merged)
      setPage(nextPage)
      setContinuation({ status: 'idle' })
    } catch (error: unknown) {
      if (!controller.signal.aborted) setContinuation({ cursor, error, status: 'error' })
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [
    continuation.status,
    gateway,
    page,
    selectionRevision,
    sessions,
    workspaceId,
    workspaceSession
  ])

  if (sessions.length === 0 && !page.hasMore) {
    return (
      <EmptyState
        action={
          <Link className="aw-primary-button" to="/interviews/new">
            {t('interviewHub.emptyAction', { defaultValue: '创建第一次练习' })}
          </Link>
        }
        description={t('interviewHub.emptyDescription', {
          defaultValue: '创建后，会话从准备到报告的完整状态会显示在这里。'
        })}
        title={t('interviewHub.emptyTitle', { defaultValue: '还没有面试会话' })}
        visual={<CalendarDays aria-hidden="true" size={22} />}
      />
    )
  }

  return (
    <>
      <ul className="aw-interview-history" id="interview-session-items">
        {sessions.map((session) => (
          <InterviewSessionRow key={session.id} locale={i18n.language} session={session} />
        ))}
      </ul>
      <p aria-live="polite" className="aw-sr-only">
        {appendedCount > 0
          ? t('interviewHub.appended', {
              count: appendedCount,
              defaultValue: '已加载 {{count}} 条面试会话'
            })
          : ''}
      </p>
      {continuation.status === 'error' ? (
        <div className="aw-resume-load-more-error" role="alert">
          <div>
            <strong>{t('interviewHub.loadMoreError', { defaultValue: '无法加载更多会话' })}</strong>
            <p>
              <ResourceFailureMessage error={continuation.error} />
            </p>
          </div>
          <button className="aw-quiet-button" onClick={() => void loadMore()} type="button">
            {t('common.retry', { defaultValue: '重试' })}
          </button>
        </div>
      ) : null}
      <div className="aw-interview-history-footer">
        <span>
          {t('interviewHub.loadedCount', {
            count: sessions.length,
            defaultValue: '已加载 {{count}} 条'
          })}
        </span>
        {page.hasMore ? (
          <button
            aria-controls="interview-session-items"
            className="aw-quiet-button"
            disabled={continuation.status === 'loading'}
            onClick={() => void loadMore()}
            type="button"
          >
            {continuation.status === 'loading'
              ? t('interviewHub.loadingMore', { defaultValue: '正在加载更多…' })
              : t('interviewHub.loadMore', { defaultValue: '加载更多' })}
          </button>
        ) : (
          <span>{t('interviewHub.end', { defaultValue: '已显示全部会话' })}</span>
        )}
      </div>
    </>
  )
}

/**
 * @brief API v2 Interview Session 生命周期首页 / API v2 Interview Session lifecycle hub.
 * @return 当前 Workspace 的真实 Session cursor 集合 / Real Session cursor collection for the current Workspace.
 */
export function InterviewHubPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief Interview 领域端口 / Interview domain port. */
  const gateway = useInterviewGateway()
  /** @brief 当前 Workspace 会话 / Current Workspace session. */
  const workspaceSession = useWorkspaceSession()
  /** @brief 首页请求代际 / First-page request generation. */
  const generation = useRef(0)
  /** @brief Workspace 切换时即时更新的修订号 / Revision updated immediately when Workspace changes. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 读取当前 Workspace 的 Session 首页 / Read the first Session page in the current Workspace. */
  const loadFirstPage = useCallback(
    async (signal: AbortSignal): Promise<InterviewHubAuthority> => {
      /** @brief 本次请求代际 / Generation of this request. */
      const requestGeneration = (generation.current += 1)
      /** @brief 读取时的当前 Workspace / Current Workspace at read time. */
      const workspace = await workspaceSession.getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      if (workspace === undefined) return { generation: requestGeneration, kind: 'no-workspace' }
      /** @brief 当前 Workspace 的首个 Session 页 / First Session page for the current Workspace. */
      const page = await gateway.listInterviewSessionPage({
        cursor: null,
        limit: INTERVIEW_SESSION_PAGE_LIMIT,
        signal,
        workspaceId: workspace.id
      })
      signal.throwIfAborted()
      return {
        generation: requestGeneration,
        kind: 'workspace',
        page,
        workspaceId: workspace.id,
        workspaceName: workspace.name
      }
    },
    [gateway, selectionRevision, workspaceSession]
  )
  /** @brief 可取消且隔离 Workspace 的首页权威 / Abortable first-page authority isolated by Workspace. */
  const authority = useAsyncResource('interview.history', loadFirstPage, selectionRevision)

  return (
    <div className="aw-page aw-interview-hub">
      <div className="aw-interview-hero">
        <div>
          <p className="aw-eyebrow">
            {authority.status === 'ready' && authority.data.kind === 'workspace'
              ? authority.data.workspaceName
              : t('interviewHub.workspaceEyebrow', { defaultValue: 'Interview Practice' })}
          </p>
          <h1 className="aw-page-title">{t('interviewHub.title', { defaultValue: '模拟面试' })}</h1>
          <p className="aw-page-description">
            {t('interviewHub.description', {
              defaultValue: '从会话准备到转录证据，在同一条生命周期里继续。'
            })}
          </p>
        </div>
        <Link className="aw-primary-button" to="/interviews/new">
          <Plus aria-hidden="true" size={16} />
          {t('interviewHub.createSession', { defaultValue: '创建练习会话' })}
        </Link>
      </div>

      <section aria-labelledby="interview-history-title" className="aw-interview-history-section">
        <div className="aw-section-heading">
          <div>
            <h2 id="interview-history-title">
              {t('interviewHub.sessions', { defaultValue: '会话记录' })}
            </h2>
            <p>
              {t('interviewHub.sessionsDescription', {
                defaultValue: '展示服务端返回的全部状态；报告只在会话完成后生成。'
              })}
            </p>
          </div>
        </div>
        {authority.status === 'loading' ? (
          <LoadingState label={t('interviewHub.loading', { defaultValue: '正在加载面试会话…' })} />
        ) : authority.status === 'error' ? (
          <ResourceErrorState
            error={authority.error}
            onRetry={authority.retry}
            title={t('interviewHub.error', { defaultValue: '无法加载面试会话' })}
          />
        ) : authority.data.kind === 'no-workspace' ? (
          <EmptyState
            description={t('interviewHub.noWorkspaceDescription', {
              defaultValue: '选择一个可访问的工作区后即可查看面试会话。'
            })}
            title={t('interviewHub.noWorkspaceTitle', { defaultValue: '尚未选择工作区' })}
            visual={<CalendarDays aria-hidden="true" size={22} />}
          />
        ) : (
          <InterviewSessionList
            gateway={gateway}
            initialPage={authority.data.page}
            key={`${selectionRevision}:${authority.data.generation}`}
            selectionRevision={selectionRevision}
            workspaceId={authority.data.workspaceId}
            workspaceSession={workspaceSession}
          />
        )}
      </section>
    </div>
  )
}
